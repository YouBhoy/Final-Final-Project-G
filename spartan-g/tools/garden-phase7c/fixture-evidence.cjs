// Read only from the explicitly verified synthetic emulator; no production credential lookup.
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),docs=path.join(root,'docs/garden-phase7c'),project='demo-spartan-g-garden-phase2';
async function main(){const stage=process.argv[2];if(!['existing-watered','missing-initialized','final'].includes(stage))throw Error('Known local evidence stage required');
 const health=await fetch('http://127.0.0.1:19098/health').then(r=>r.json());if(health.projectId!==project||!health.ready||!health.deviceIsolation)throw Error('Isolated synthetic environment required');
 process.env.GCLOUD_PROJECT=project;process.env.GOOGLE_CLOUD_PROJECT=project;process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:18089';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:19099';process.env.GOOGLE_APPLICATION_CREDENTIALS='';process.env.GCE_METADATA_HOST='127.0.0.1:1';
 const req=createRequire(path.join(root,'functions/package.json')),{initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
 const app=initializeApp({projectId:project},'phase7c-read-only-evidence'),db=getFirestore(app);
 try{const gardens=[];for(const uid of ['local-garden-existing','local-garden-missing','local-garden-other']){
   const snap=await db.doc(`student_gardens/${uid}`).get(),d=snap.data();gardens.push({uid,exists:snap.exists,...(d?{studentId:d.studentId,level:d.level,xp:d.xp,seeds:d.seeds,streakCount:d.streakCount,lastCheckInDate:d.lastCheckInDate,lastWateredDate:d.lastWateredDate}:{})});}
  const receipts=await db.collection('garden_reward_receipts').get();
  const metadata=receipts.docs.map(s=>{const d=s.data();return {id:s.id,kind:d.kind||d.identity?.kind,status:d.status,studentId:d.studentId||d.identity?.studentId,requestId:d.requestId||d.identity?.requestId,day:d.day||d.rewardDay,result:d.result?{status:d.result.status,xpAwarded:d.result.xpAwarded,seedsAwarded:d.result.seedsAwarded}:undefined};});
  const result={at:new Date().toISOString(),projectId:project,host:process.env.FIRESTORE_EMULATOR_HOST,stage,gardens,receipts:metadata,readOnly:true,productionAccess:false};
  fs.writeFileSync(path.join(docs,`fixtures-${stage}.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{await db.terminate();await deleteApp(app);}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
