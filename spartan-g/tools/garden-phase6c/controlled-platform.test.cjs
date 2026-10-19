// Actual Auth-emulator tokens and prepared production handlers; synthetic loopback only.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const {initializeApp,deleteApp}=require('firebase/app'),authSdk=require('firebase/auth'),store=require('firebase/firestore'),fnSdk=require('firebase/functions');
const root=path.resolve(__dirname,'../..'), backend=createRequire(path.join(root,'functions/package.json'));
const fixture=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'spartan-g-garden-phase6c/private-credentials.json'),'utf8'));
const project='demo-spartan-g-garden-phase2';assert.equal(fixture.projectId,project);assert.equal(fixture.controlled,true,'Fresh --controlled fixture required');
process.env.GCLOUD_PROJECT=project;process.env.GOOGLE_CLOUD_PROJECT=project;process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:18089';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:19099';process.env.GCE_METADATA_HOST='127.0.0.1:1';
const adminAppSdk=backend('firebase-admin/app'),adminStore=backend('firebase-admin/firestore');
const adminApp=adminAppSdk.initializeApp({projectId:project},'controlled-platform-admin'),db=adminStore.getFirestore(adminApp);
const {createControlledGardenRuntime,setGardenSwitch,switchPath}=backend('./lib/garden-production/activation');
const {assertLocalRewardDatabase}=backend('./lib/garden-rewards/local-safety');
const {operationId}=backend('./lib/garden-rewards/eligibility');
const runtime=createControlledGardenRuntime(assertLocalRewardDatabase),clients=[];
let student,other,winningId,attemptId;
const read=async name=>(await db.doc(name).get()).data();
async function toggle(name,enabled){const value=await read(switchPath(name));return setGardenSwitch(db,runtime,name,enabled,value.revision);}
async function client(name){
 const value=fixture.accounts.find(a=>a.fixture===name);assert.ok(value);
 const app=initializeApp({projectId:project,apiKey:'synthetic-local-emulator-only'},`controlled-platform-${name}`);
 const auth=authSdk.getAuth(app);authSdk.connectAuthEmulator(auth,'http://127.0.0.1:19099',{disableWarnings:true});
 const db=store.initializeFirestore(app,{localCache:store.memoryLocalCache()});store.connectFirestoreEmulator(db,'127.0.0.1',18089);
 const functions=fnSdk.getFunctions(app,'asia-southeast1');fnSdk.connectFunctionsEmulator(functions,'127.0.0.1',15001);
 const user=(await authSdk.signInWithEmailAndPassword(auth,value.email,value.password)).user;
 const result={app,auth,db,functions,user,uid:user.uid};clients.push(result);return result;
}
const invoke=(c,name,data)=>fnSdk.httpsCallable(c.functions,name,{timeout:20000})(data).then(r=>r.data);
const garden=()=>store.getDoc(store.doc(student.db,'student_gardens',student.uid)).then(s=>s.data());
before(async()=>{store.setLogLevel('silent');student=await client('automated');other=await client('other');},{timeout:30000});
after(async()=>{for(const c of clients){await store.terminate(c.db);await deleteApp(c.app);}await db.terminate();await adminAppSdk.deleteApp(adminApp);});

test('actual authenticated callable routing uses prepared production region on loopback',async()=>{
 const token=await student.user.getIdToken(),claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
 assert.equal(claims.aud,project);assert.equal(claims.sub,student.uid);assert.equal(student.functions.region,'asia-southeast1');assert.equal(student.functions.emulatorOrigin,'http://127.0.0.1:15001');
 for(const name of ['assessment','watering','recovery'])assert.equal((await read(switchPath(name))).enabled,false);
});
test('prepared handlers fail closed with disabled activation; first-time initialization remains exact',async()=>{
 const ref=store.doc(student.db,'student_gardens',student.uid);assert.equal((await store.getDoc(ref)).exists(),false);
 await store.setDoc(ref,{studentId:student.uid,level:1,xp:0,seeds:0,streakCount:0,lastCheckInDate:'',lastWateredDate:'',createdAt:store.serverTimestamp(),updatedAt:store.serverTimestamp()});
 await assert.rejects(()=>invoke(student,'waterGarden',{requestId:crypto.randomUUID()}),e=>e.code==='functions/unavailable'&&e.details.reason==='paused');
 assert.equal((await garden()).xp,0);assert.equal((await db.collection('garden_reward_receipts').get()).size,0);
});
test('concurrent HTTP requests, pause and resume preserve one daily award and one request receipt',async()=>{
 await toggle('watering',true);winningId=crypto.randomUUID();
 const replies=await Promise.all(Array.from({length:5},()=>invoke(student,'waterGarden',{requestId:winningId})));
 assert.equal(replies.filter(r=>r.status==='rewarded').length,1);assert.equal((await garden()).xp,2);
 const before=(await db.collection('garden_reward_receipts').get()).docs.map(s=>({id:s.id,data:s.data()}));
 await toggle('watering',false);await assert.rejects(()=>invoke(student,'waterGarden',{requestId:winningId}),e=>e.details.reason==='paused');
 await toggle('watering',true);assert.equal((await invoke(student,'waterGarden',{requestId:winningId})).status,'replayed');
 assert.deepEqual((await db.collection('garden_reward_receipts').get()).docs.map(s=>({id:s.id,data:s.data()})),before);assert.equal((await garden()).xp,2);
});
test('real submitted event stores trusted proof while assessment rewards are paused', {timeout:60000},async()=>{
 attemptId=`local-lesson_${student.uid}_1`;const ref=store.doc(student.db,'assessment_attempts',attemptId);
 await store.setDoc(ref,{assessmentId:'local-lesson',studentId:student.uid,attemptNumber:1,status:'in_progress',answers:[],startedAt:store.serverTimestamp()});
 await store.updateDoc(ref,{status:'submitted',answers:[{questionId:'q1',value:'synthetic response'}],submittedAt:store.serverTimestamp()});
 let witness;for(let i=0;i<60;i++){witness=await read(`garden_reward_submissions/${operationId(attemptId)}`);if(witness)break;await new Promise(r=>setTimeout(r,500));}
 assert.ok(witness);assert.equal((await garden()).xp,2);assert.equal(await read(`garden_reward_receipts/${operationId(attemptId)}`),undefined);
 await assert.rejects(()=>invoke(student,'recoverAssessmentReward',{attemptId}),e=>e.code==='functions/unavailable'&&e.details.reason==='paused');
});
test('owner recovery after resume awards exactly 10 XP and 5 seeds; recovery can pause independently',async()=>{
 await toggle('assessment',true);await toggle('recovery',true);
 const replies=await Promise.all([invoke(student,'recoverAssessmentReward',{attemptId}),invoke(student,'recoverAssessmentReward',{attemptId})]);
 assert.ok(replies.every(r=>['applied','already_applied'].includes(r.status)));assert.deepEqual([(await garden()).xp,(await garden()).seeds,(await garden()).streakCount],[12,5,1]);
 await toggle('recovery',false);await assert.rejects(()=>invoke(student,'recoverAssessmentReward',{attemptId}),e=>e.details.reason==='paused');
 await toggle('recovery',true);assert.equal((await invoke(student,'recoverAssessmentReward',{attemptId})).status,'already_applied');assert.equal((await garden()).xp,12);
 await assert.rejects(()=>invoke(other,'recoverAssessmentReward',{attemptId}),e=>e.code==='functions/permission-denied');
});
test('actual HTTP transport rejects invalid tokens and client-supplied reward or owner fields',async()=>{
 const token=await student.user.getIdToken(),claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
 const altered=patch=>token.split('.')[0]+'.'+Buffer.from(JSON.stringify({...claims,...patch})).toString('base64url')+'.';
 for(const value of [null,'malformed-token',altered({aud:'demo-wrong-project'}),altered({exp:1})]){
  const response=await fetch(`http://127.0.0.1:15001/${project}/asia-southeast1/waterGarden`,{method:'POST',headers:{'Content-Type':'application/json',...(value?{Authorization:`Bearer ${value}`}:{})},body:JSON.stringify({data:{requestId:crypto.randomUUID()}})});assert.equal(response.status,401);
 }
 await assert.rejects(()=>invoke(student,'waterGarden',{requestId:crypto.randomUUID(),xp:999}),e=>e.code==='functions/invalid-argument');
 await assert.rejects(()=>invoke(student,'recoverAssessmentReward',{attemptId,studentId:other.uid}),e=>e.code==='functions/invalid-argument');
});
test('real client SDK cannot inspect or modify any production-policy switch',async()=>{
 for(const c of [student,other])for(const name of ['assessment','watering','recovery']){
  const ref=store.doc(c.db,switchPath(name));await assert.rejects(()=>store.getDoc(ref),e=>e.code==='permission-denied');await assert.rejects(()=>store.updateDoc(ref,{enabled:true}),e=>e.code==='permission-denied');
 }
});
