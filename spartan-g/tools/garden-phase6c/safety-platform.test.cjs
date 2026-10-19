// Real local Auth -> callable HTTP -> Firestore/trigger. Synthetic accounts only.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),backend=createRequire(path.join(root,'functions/package.json'));
const fixture=JSON.parse(fs.readFileSync(path.join(os.tmpdir(),'spartan-g-garden-phase6c/private-credentials.json'),'utf8'));
const project='demo-spartan-g-garden-phase2';assert.equal(fixture.projectId,project);assert.equal(fixture.safety,true);
process.env.GCLOUD_PROJECT=project;process.env.GOOGLE_CLOUD_PROJECT=project;process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:18089';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:19099';process.env.GCE_METADATA_HOST='127.0.0.1:1';process.env.GOOGLE_APPLICATION_CREDENTIALS='';
const actualFetch=global.fetch;let blocked=0;
global.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url??input);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!['15001','18089','19099','19098'].includes(url.port)){blocked++;throw Error('Synthetic test blocked nonlocal HTTP');}return actualFetch(input,init);};
const {initializeApp,deleteApp}=require('firebase/app'),authSdk=require('firebase/auth'),store=require('firebase/firestore'),fnSdk=require('firebase/functions');
const admin=backend('firebase-admin/app'),adminStore=backend('firebase-admin/firestore'),app=admin.initializeApp({projectId:project},'safety-platform-admin'),db=adminStore.getFirestore(app);
const {assertLocalRewardDatabase}=backend('./lib/garden-rewards/local-safety');assertLocalRewardDatabase(db);
const {createSafetyControlledGardenRuntime,ratePath,GARDEN_REQUEST_LIMITS}=backend('./lib/garden-production/safety');
const {createGardenOperator,allowlistPath,ROLLOUT_PATH}=backend('./lib/garden-production/rollout');
const {switchPath}=backend('./lib/garden-production/activation');
const {operationId}=backend('./lib/garden-rewards/eligibility');
const operator=createGardenOperator(db,createSafetyControlledGardenRuntime(assertLocalRewardDatabase)),clients=[];
let student,other,attemptId,requestId;
const read=async name=>(await db.doc(name).get()).data();
async function toggle(kind,enabled){const value=await read(switchPath(kind));return operator.setSwitch(kind,enabled,value.revision);}
async function user(name){const account=fixture.accounts.find(a=>a.fixture===name);assert.ok(account);const app=initializeApp({projectId:project,apiKey:'synthetic-local-emulator-only'},`safety-platform-${name}`),auth=authSdk.getAuth(app);authSdk.connectAuthEmulator(auth,'http://127.0.0.1:19099',{disableWarnings:true});const db=store.initializeFirestore(app,{localCache:store.memoryLocalCache()});store.connectFirestoreEmulator(db,'127.0.0.1',18089);const functions=fnSdk.getFunctions(app,'asia-southeast1');fnSdk.connectFunctionsEmulator(functions,'127.0.0.1',15001);const signed=(await authSdk.signInWithEmailAndPassword(auth,account.email,account.password)).user;const result={app,auth,db,functions,user:signed,uid:signed.uid};clients.push(result);return result;}
const invoke=(who,name,data)=>fnSdk.httpsCallable(who.functions,name,{timeout:25000})(data).then(r=>r.data);
const garden=()=>read(`student_gardens/${student.uid}`);
before(async()=>{store.setLogLevel('silent');student=await user('automated');other=await user('other');},{timeout:30000});
after(async()=>{for(const c of clients){await store.terminate(c.db);await deleteApp(c.app);}await db.terminate();await admin.deleteApp(app);global.fetch=actualFetch;});

test('synthetic Auth and callable routing use exact loopback project and production region',async()=>{
 const claims=JSON.parse(Buffer.from((await student.user.getIdToken()).split('.')[1],'base64url'));assert.equal(claims.aud,project);assert.equal(claims.sub,student.uid);assert.equal(student.functions.emulatorOrigin,'http://127.0.0.1:15001');assert.equal(student.functions.region,'asia-southeast1');
 for(const kind of ['assessment','watering','recovery'])assert.equal((await read(switchPath(kind))).enabled,false);
 await assert.rejects(()=>fetch('https://example.invalid/blocked'),/blocked nonlocal/);assert.equal(blocked,1);
});
test('disabled controls deny writes; exact first-time Garden initializes locally under candidate rules',async()=>{
 const ref=store.doc(student.db,'student_gardens',student.uid);assert.equal((await store.getDoc(ref)).exists(),false);
 await store.setDoc(ref,{studentId:student.uid,level:1,xp:0,seeds:0,streakCount:0,lastCheckInDate:'',lastWateredDate:'',createdAt:store.serverTimestamp(),updatedAt:store.serverTimestamp()});
 await assert.rejects(()=>invoke(student,'waterGarden',{requestId:crypto.randomUUID()}),e=>e.details.reason==='paused');assert.equal((await garden()).xp,0);
});
test('general enablement does not authorize non-allowlisted real Auth emulator session or injected UID',async()=>{
 for(const kind of ['assessment','watering','recovery'])await toggle(kind,true);
 await assert.rejects(()=>invoke(other,'waterGarden',{requestId:crypto.randomUUID(),studentId:student.uid}),e=>e.code==='functions/permission-denied');
 await assert.rejects(()=>invoke(other,'recoverAssessmentReward',{attemptId:`local-lesson_${student.uid}_1`}),e=>e.code==='functions/permission-denied');
 assert.equal(await read(ratePath(other.uid,'watering')),undefined);assert.equal((await garden()).xp,0);
});
test('new allowlisted real submitted event creates proof and exactly one assessment reward',{timeout:60000},async()=>{
 attemptId=`local-lesson_${student.uid}_1`;const ref=store.doc(student.db,'assessment_attempts',attemptId);
 await store.setDoc(ref,{assessmentId:'local-lesson',studentId:student.uid,attemptNumber:1,status:'in_progress',answers:[],startedAt:store.serverTimestamp()});
 await store.updateDoc(ref,{status:'submitted',answers:[{questionId:'q1',value:'SYNTHETIC SAFETY RESPONSE'}],submittedAt:store.serverTimestamp()});
 let receipt;for(let i=0;i<70;i++){receipt=await read(`garden_reward_receipts/${operationId(attemptId)}`);if(receipt)break;await new Promise(r=>setTimeout(r,500));}
 assert.ok(receipt);assert.deepEqual([(await garden()).xp,(await garden()).seeds],[10,5]);
 assert.equal((await invoke(student,'recoverAssessmentReward',{attemptId})).status,'already_applied');assert.equal((await garden()).xp,10);
});
test('authenticated watering, lost-response replay and concurrent retry preserve one daily reward',{timeout:60000},async()=>{
 requestId=crypto.randomUUID();const first=await invoke(student,'waterGarden',{requestId});assert.equal(first.status,'rewarded');
 const replies=await Promise.all([invoke(student,'waterGarden',{requestId}),invoke(student,'waterGarden',{requestId})]);assert.ok(replies.every(r=>r.status==='replayed'));
 assert.deepEqual([(await garden()).xp,(await garden()).seeds],[12,5]);
});
test('actual callable pause and resume keep receipt identities and existing XP',async()=>{
 const prior=(await db.collection('garden_reward_receipts').get()).docs.map(d=>({id:d.id,data:d.data()}));
 await toggle('watering',false);await assert.rejects(()=>invoke(student,'waterGarden',{requestId}),e=>e.details.reason==='paused');await toggle('watering',true);
 assert.equal((await invoke(student,'waterGarden',{requestId})).status,'replayed');assert.deepEqual((await db.collection('garden_reward_receipts').get()).docs.map(d=>({id:d.id,data:d.data()})),prior);
});
test('real client cannot self-enroll or change rollout/throttle/private history or another Garden',async()=>{
 for(const p of [ROLLOUT_PATH,allowlistPath(student.uid),ratePath(student.uid,'watering'),'garden_reward_receipts/private','garden_reward_submissions/private','garden_reward_switches/assessment_v1']){
  const ref=store.doc(student.db,p);await assert.rejects(()=>store.getDoc(ref),e=>e.code==='permission-denied');await assert.rejects(()=>store.setDoc(ref,{enabled:true}),e=>e.code==='permission-denied');
 }
 await assert.rejects(()=>store.getDoc(store.doc(other.db,'student_gardens',student.uid)),e=>e.code==='permission-denied');
});
test('missing/expired/wrong-project HTTP tokens rejected; malformed payload cannot forge admin audit',async()=>{
 const token=await student.user.getIdToken(),claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
 for(const auth of [null,'invalid-token',`${token.split('.')[0]}.${Buffer.from(JSON.stringify({...claims,aud:'demo-wrong-project'})).toString('base64url')}.`,`${token.split('.')[0]}.${Buffer.from(JSON.stringify({...claims,exp:1})).toString('base64url')}.`]){
  const response=await fetch(`http://127.0.0.1:15001/${project}/asia-southeast1/waterGarden`,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${auth}`}:{})},body:JSON.stringify({data:{requestId:crypto.randomUUID()}})});assert.equal(response.status,401);
 }
 await assert.rejects(()=>invoke(student,'waterGarden',{requestId:crypto.randomUUID(),event:'operator_rollout',enabled:true}),e=>e.code==='functions/invalid-argument');
});
test('resource-exhausted retry response crosses real HTTP without deleting any receipt',async()=>{
 // Synthetic server fixture sets the limit deterministically; actual flood behavior is in transaction tests.
 const key=ratePath(student.uid,'recovery');await db.doc(key).set({schemaVersion:1,studentKey:key.split('_').at(-1),operation:'recovery',windowStart:Math.floor(Date.now()/60000)*60000,count:GARDEN_REQUEST_LIMITS.recovery,leases:[]});
 const before=(await db.collection('garden_reward_receipts').get()).size;
 await assert.rejects(()=>invoke(student,'recoverAssessmentReward',{attemptId}),e=>e.code==='functions/resource-exhausted'&&e.details.retryable&&e.details.retryAfterSeconds>0);
 assert.equal((await db.collection('garden_reward_receipts').get()).size,before);
});
test('operator removal blocks new HTTP mutations and leaves existing balances and receipts durable',async()=>{
 const saved=await garden(),receipts=(await db.collection('garden_reward_receipts').get()).docs.map(d=>({id:d.id,data:d.data()})),member=await read(allowlistPath(student.uid)),config=await read(ROLLOUT_PATH);
 await operator.enroll(student.uid,false,config.expiresAt,member.revision);
 await assert.rejects(()=>invoke(student,'waterGarden',{requestId:crypto.randomUUID()}),e=>e.code==='functions/permission-denied');
 await assert.rejects(()=>invoke(student,'recoverAssessmentReward',{attemptId}),e=>e.code==='functions/permission-denied');assert.deepEqual(await garden(),saved);
 assert.deepEqual((await db.collection('garden_reward_receipts').get()).docs.map(d=>({id:d.id,data:d.data()})),receipts);
});
