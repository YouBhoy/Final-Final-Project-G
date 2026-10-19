// Actual OkHttp -> localhost TLS fixture -> original Node API -> synthetic Auth/Firestore.
const {test,before,beforeEach,afterEach,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {tlsServer,bridge,transport,randomUUID,backend,load}=require('./native-fixture.cjs');
const {initializeApp,deleteApp}=backend('firebase-admin/app'),{getFirestore,Timestamp,FieldValue}=backend('firebase-admin/firestore'),{getAuth}=backend('firebase-admin/auth');
const clientApp=backend('firebase/app'),authSdk=backend('firebase/auth'),store=backend('firebase/firestore');
const {createGardenServer}=backend('./lib/external-garden/server'),{createTokenVerifier}=backend('./lib/external-garden/auth'),{createGardenHttpService}=backend('./lib/external-garden/service');
const {createSafetyControlledGardenRuntime}=backend('./lib/garden-production/safety'),{createControlledGardenRuntime,initializeGardenSwitch,switchPath}=backend('./lib/garden-production/activation');
const {createGardenOperator}=backend('./lib/garden-production/rollout'),{assertLocalRewardDatabase}=backend('./lib/garden-rewards/local-safety'),{operationId}=backend('./lib/garden-rewards/eligibility');
const project='demo-spartan-g-garden-phase2',uid='native-synthetic-a',other='native-synthetic-b';
assert.equal(process.env.GCLOUD_PROJECT,project);assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:18088');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:19097');
const app=initializeApp({projectId:project},'native-garden-emulators'),db=getFirestore(app),auth=getAuth(app),users={};
const {GardenOperationsClient}=load('packages/shared-services/src/services/garden-operations.client.ts');
let api,endpoint,native,operator,runtime,now,expiry,mode,committed;
const read=async p=>(await db.doc(p).get()).data(),garden=()=>read(`student_gardens/${uid}`),key=operationId;
const client=()=>transport(native,{uid,currentUser:()=>users[uid].auth.currentUser});
async function toggle(kind,on){const current=await read(switchPath(kind));await operator.setSwitch(kind,on,current.revision);}
async function draft(owner=uid,answers=[{questionId:'q',value:'Synthetic answer, no student data'}]){
 const id=`lesson_${owner}_1`;await db.doc(`assessment_attempts/${id}`).create({studentId:owner,assessmentId:'lesson',attemptNumber:1,status:'in_progress',answers,
  overallRiskScore:42,overallRiskLevel:'preserved',startedAt:FieldValue.serverTimestamp()});return id;}
before(async()=>{
 for(const id of [uid,other]){
  await auth.createUser({uid:id,email:`${id}@example.invalid`,password:randomUUID()});
  const a=clientApp.initializeApp({apiKey:'synthetic',projectId:project},id),session=authSdk.getAuth(a);
  authSdk.connectAuthEmulator(session,'http://127.0.0.1:19097',{disableWarnings:true});
  await authSdk.signInWithCustomToken(session,await auth.createCustomToken(id));users[id]={app:a,auth:session};
 }
});
beforeEach(async()=>{
 assert.ok((await fetch(`http://127.0.0.1:18088/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE',redirect:'error'})).ok);
 now=Date.now()+1000;expiry=Timestamp.fromMillis(now+86400000);mode='normal';committed=()=>{};
 runtime=createSafetyControlledGardenRuntime(assertLocalRewardDatabase,()=>new Date(now));operator=createGardenOperator(db,runtime,()=>new Date(now),()=>{});
 for(const id of [uid,other])await db.doc(`users/${id}`).create({uid:id,role:'student',isActive:true});
 await db.doc(`student_gardens/${uid}`).create({studentId:uid,level:1,xp:0,seeds:0,streakCount:0,lastCheckInDate:'',lastWateredDate:'',createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
 await db.doc('assessments/lesson').create({courseId:'course',facilitatorId:'staff',isPublished:true,maxAttempts:3,questions:[{id:'q',type:'short_answer'}]});
 for(const kind of ['assessment','watering'])await db.doc(`garden_reward_control/${kind}_v1`).create({enabled:true,policyVersion:'legacy-v1',legacyClientRewardWritesBlocked:true});
 const base=createControlledGardenRuntime(assertLocalRewardDatabase);for(const kind of ['assessment','recovery','watering'])await initializeGardenSwitch(db,base,kind);
 await operator.initialize(expiry);await operator.configure(true,expiry,1);await operator.enroll(uid,true,expiry,0);
 for(const kind of ['assessment','recovery','watering'])await toggle(kind,true);
 api=createGardenServer(createGardenHttpService(db,runtime,()=>new Date(now),()=>{}),createTokenVerifier(auth,project,true,()=>{}));
 await new Promise(r=>api.server.listen(0,'127.0.0.1',r));const port=api.server.address().port;
 endpoint=await tlsServer((q,r)=>{
  if(!['/v1/watering','/v1/assessments/finalize','/v1/assessments/recover'].includes(q.url)){r.writeHead(404);r.end();return;}
  const request=http.request({hostname:'127.0.0.1',port,path:q.url,method:'POST',headers:{Authorization:q.headers.authorization,'Content-Type':'application/json'}},response=>{
   let body='';response.on('data',b=>body+=b);response.on('end',()=>{
    committed();if(mode==='drop'){mode='normal';r.destroy();return;}if(mode==='hold')return;
    r.writeHead(response.statusCode,{'Content-Type':'application/json',...(response.headers['retry-after']?{'Retry-After':response.headers['retry-after']}:{})});r.end(body);
   });
  });request.on('error',()=>{r.writeHead(503);r.end('{}');});q.pipe(request);
 });native=await bridge(endpoint.origin);
});
afterEach(async()=>{await native?.close();await endpoint?.close();await api?.close();});
after(async()=>{for(const user of Object.values(users)){await authSdk.signOut(user.auth);await clientApp.deleteApp(user.app);}await db.terminate();await deleteApp(app);});

test('real synthetic Firebase ID token is verified through native HTTPS and watering preserves its UUID',async()=>{
 const id=randomUUID(),first=await client().invoke('waterGarden',{requestId:id}),replay=await client().invoke('waterGarden',{requestId:id});
 assert.equal(first.requestId,id);assert.equal(first.status,'rewarded');assert.equal(replay.status,'replayed');assert.deepEqual([(await garden()).xp,(await garden()).seeds],[2,0]);
});

test('native finalization preserves trusted evidence, exact assessment policy and durable receipt identity',async()=>{
 const id=await draft(),first=await client().invoke('finalizeAssessment',{attemptId:id});assert.equal(first.status,'applied');
 assert.deepEqual([(await garden()).xp,(await garden()).seeds],[10,5]);assert.equal((await read(`assessment_attempts/${id}`)).overallRiskScore,42);
 const saved=await read(`garden_reward_receipts/${key(id)}`);assert.equal((await client().invoke('recoverAssessmentReward',{attemptId:id})).status,'already_applied');
 assert.deepEqual(await read(`garden_reward_receipts/${key(id)}`),saved);assert.ok(await read(`garden_submission_outbox/${key(id)}`));
});

test('native requests cannot reward another owner or a nonallowlisted Auth session',async()=>{
 const id=await draft(other);await assert.rejects(()=>client().invoke('finalizeAssessment',{attemptId:id}),e=>e.status===403&&e.reason==='not_attempt_owner');
 await assert.rejects(()=>transport(native,{uid:other,currentUser:()=>users[other].auth.currentUser}).invoke('waterGarden',{requestId:randomUUID()}),e=>e.status===403&&e.reason==='not_allowlisted');assert.equal((await garden()).xp,0);
});

test('invalid completion stays unsubmitted and its permanent hold survives a new JS transport',async()=>{
 const id=await draft(uid,[]),terminals=new Map(),options={uid,currentUser:()=>users[uid].auth.currentUser,terminals};
 await assert.rejects(()=>transport(native,options).invoke('finalizeAssessment',{attemptId:id}),e=>e.status===409&&!e.retryable);
 await assert.rejects(()=>transport(native,options).invoke('finalizeAssessment',{attemptId:id}),e=>e.reason==='review_required');
 assert.equal((await read(`assessment_attempts/${id}`)).status,'in_progress');assert.equal(await read(`garden_submission_outbox/${key(id)}`),undefined);
});

test('concurrent native finalization requests grant one award',async()=>{
 const id=await draft(),results=await Promise.all([client().invoke('finalizeAssessment',{attemptId:id}),client().invoke('finalizeAssessment',{attemptId:id})]);
 assert.equal(results.filter(r=>r.status==='applied').length,1);assert.equal(results.filter(r=>r.status==='already_applied').length,1);assert.equal((await garden()).xp,10);
});

test('lost native response after commit preserves the existing coordinator UUID across restart',async()=>{
 const storage=new Map(),ids=[],dependencies={currentUid:()=>uid,requestId:()=>{const id=randomUUID();ids.push(id);return id;},
  storage:{read:async u=>storage.get(u)??null,write:async(u,value)=>storage.set(u,JSON.parse(JSON.stringify(value)))},invoke:(name,data)=>client().invoke(name,data)};
 mode='drop';const first=new GardenOperationsClient(dependencies);assert.equal((await first.water(uid)).status,'pending');assert.equal((await garden()).xp,2);
 const saved=storage.get(uid).wateringRequestId;assert.equal(saved,ids[0]);const second=new GardenOperationsClient(dependencies);await second.hydrate(uid);
 assert.equal((await second.water(uid)).status,'confirmed');assert.equal(ids.length,1);assert.equal(storage.get(uid).wateringRequestId,undefined);assert.equal((await garden()).xp,2);
});

test('native cancellation after a committed assessment remains unknown and recovery never duplicates it',async()=>{
 const id=await draft(),controller=new AbortController(),commit=new Promise(resolve=>{committed=resolve;});mode='hold';
 const request=client().invoke('finalizeAssessment',{attemptId:id},controller.signal),caught=assert.rejects(()=>request,e=>e.reason==='cancelled'&&e.outcomeUnknown);
 await commit;controller.abort();await caught;mode='normal';assert.equal((await client().invoke('recoverAssessmentReward',{attemptId:id})).status,'already_applied');assert.equal((await garden()).xp,10);
});

test('native call deadline after commit preserves the operation for same-ID recovery',async()=>{
 const id=await draft(),commit=new Promise(resolve=>{committed=resolve;});mode='hold';
 const promise=transport(native,{uid,timeoutMs:1000,currentUser:()=>users[uid].auth.currentUser}).invoke('finalizeAssessment',{attemptId:id});
 const caught=assert.rejects(()=>promise,e=>e.reason==='outcome_unknown'&&e.retryable);await commit;await caught;mode='normal';
 assert.equal((await client().invoke('recoverAssessmentReward',{attemptId:id})).status,'already_applied');assert.equal((await garden()).xp,10);
});

test('native pending submission and recovery respect server pause/resume switches',async()=>{
 await toggle('assessment',false);const id=await draft(),pending=await client().invoke('finalizeAssessment',{attemptId:id});assert.equal(pending.status,'pending');assert.equal(pending.submissionStatus,'submitted');
 await assert.rejects(()=>client().invoke('recoverAssessmentReward',{attemptId:id}),e=>e.status===503&&e.reason==='paused');await toggle('assessment',true);
 assert.equal((await client().invoke('recoverAssessmentReward',{attemptId:id})).status,'applied');assert.equal((await garden()).xp,10);
});

test('candidate rules permit owner Garden initialization and deny forged rewards/private outbox access',async()=>{
 await db.doc(`student_gardens/${uid}`).delete();const d=store.initializeFirestore(users[uid].app,{localCache:store.memoryLocalCache()});store.connectFirestoreEmulator(d,'127.0.0.1',18088);store.setLogLevel('silent');
 try{const g=store.doc(d,'student_gardens',uid);await store.setDoc(g,{studentId:uid,level:1,xp:0,seeds:0,streakCount:0,lastCheckInDate:'',lastWateredDate:'',createdAt:store.serverTimestamp(),updatedAt:store.serverTimestamp()});
  assert.equal((await store.getDoc(g)).data().xp,0);await assert.rejects(()=>store.updateDoc(g,{xp:999}),e=>e.code==='permission-denied');
  await assert.rejects(()=>store.getDoc(store.doc(d,'garden_submission_outbox','synthetic')),e=>e.code==='permission-denied');
 }finally{await store.terminate(d);}
});
