const {test,before,beforeEach,after,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),http=require('node:http'),cp=require('node:child_process'),path=require('node:path');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp,FieldValue}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const {createGardenServer}=require('../lib/external-garden/server'),{createTokenVerifier}=require('../lib/external-garden/auth');
const {createGardenHttpService}=require('../lib/external-garden/service'),{HostGardenClient}=require('../lib/external-garden/client');
const {GardenFinalizer,OUTBOX}=require('../lib/external-garden/finalizer'),{externalConfiguration}=require('../lib/external-garden');
const {createSafetyControlledGardenRuntime,ratePath}=require('../lib/garden-production/safety');
const {createGardenOperator,allowlistPath}=require('../lib/garden-production/rollout');
const {createControlledGardenRuntime,initializeGardenSwitch,switchPath}=require('../lib/garden-production/activation');
const {assertLocalRewardDatabase}=require('../lib/garden-rewards/local-safety');
const {operationId}=require('../lib/garden-rewards/eligibility');
const clientApp=require('firebase/app'),client=require('firebase/firestore');
const project='demo-spartan-g-garden-phase2',uid='http-synthetic-a',other='http-synthetic-b';
assert.equal(process.env.GCLOUD_PROJECT,project);assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:18088');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:19097');
const app=initializeApp({projectId:project},'external-http-tests'),db=getFirestore(app),auth=getAuth(app),tokens={},children=[];
let api,origin,runtime,operator,service,now,expiry,events;
const read=async p=>(await db.doc(p).get()).data(),garden=()=>read(`student_gardens/${uid}`),key=id=>operationId(id);
const receipt=id=>read(`garden_reward_receipts/${key(id)}`),outbox=id=>read(`${OUTBOX}/${key(id)}`);
async function raw(route,body={},token=tokens[uid],options={}){
 const response=await fetch(origin+route,{method:'POST',redirect:'error',headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json',...options.headers},body:JSON.stringify(body),...options});
 return {status:response.status,headers:response.headers,body:await response.json()};
}
const finalize=(id,owner=uid)=>raw('/v1/assessments/finalize',{attemptId:id},tokens[owner]);
const recover=(id,owner=uid)=>raw('/v1/assessments/recover',{attemptId:id},tokens[owner]);
const water=(id=randomUUID(),owner=uid)=>raw('/v1/watering',{requestId:id},tokens[owner]);
const denied=(response,status,reason)=>{assert.equal(response.status,status,JSON.stringify(response.body));if(reason)assert.equal(response.body.error?.reason,reason);};
async function toggle(kind,enabled){const value=await read(switchPath(kind));await operator.setSwitch(kind,enabled,value.revision);}
async function draft(owner=uid,n=1,answers=[{questionId:'q1',value:'PRIVATE SYNTHETIC ANSWER'},{questionId:'q2',value:'yes'}]){
 const id=`lesson_${owner}_${n}`;await db.doc(`assessment_attempts/${id}`).create({studentId:owner,assessmentId:'lesson',attemptNumber:n,status:'in_progress',answers,
  overallRiskLevel:'unchanged-test-value',overallRiskScore:123,legacyField:'preserve',startedAt:FieldValue.serverTimestamp()});return id;
}
async function startServer(selectedService=service,timeout=30000){
 api=createGardenServer(selectedService,createTokenVerifier(auth,project,true,event=>events.push(event)),timeout);
 await new Promise((resolve,reject)=>{api.server.once('error',reject);api.server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${api.server.address().port}`;
}
function hostClient(user=uid,timeoutMs=75000,terminals=new Map()){
 return new HostGardenClient({origin,local:true,timeoutMs,user:()=>({uid:user,token:async()=>tokens[user]}),
  terminals:{read:async(u,id)=>terminals.has(`${u}:${id}`),write:async(u,id)=>{terminals.set(`${u}:${id}`,true);}}});
}
before(async()=>{
 for(const user of [uid,other]){
  try{await auth.getUser(user);}catch{await auth.createUser({uid:user,email:`${user}@example.invalid`,password:randomUUID()});}
  const custom=await auth.createCustomToken(user);
  const response=await fetch('http://127.0.0.1:19097/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:custom,returnSecureToken:true})});
  assert.ok(response.ok,'Synthetic emulator login failed');tokens[user]=(await response.json()).idToken;
 }
});
beforeEach(async()=>{
 assert.ok((await fetch(`http://127.0.0.1:18088/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE'})).ok);
 now=Date.now()+1000;expiry=Timestamp.fromMillis(now+4*86400000);events=[];
 runtime=createSafetyControlledGardenRuntime(assertLocalRewardDatabase,()=>new Date(now));
 operator=createGardenOperator(db,runtime,()=>new Date(now),event=>events.push(event));
 for(const user of [uid,other])await db.doc(`users/${user}`).create({uid:user,role:'student',isActive:true});
 await db.doc(`student_gardens/${uid}`).create({studentId:uid,level:1,xp:0,seeds:0,streakCount:0,lastCheckInDate:'',lastWateredDate:'',createdAt:Timestamp.fromMillis(1000),updatedAt:Timestamp.fromMillis(1000),legacyBadge:'keep'});
 await db.doc('assessments/lesson').create({courseId:'course',facilitatorId:'staff',isPublished:true,maxAttempts:3,
  questions:[{id:'q1',type:'short_answer'},{id:'q2',type:'multiple_choice',options:[{id:'yes'},{id:'no'}]}]});
 for(const name of ['assessment','watering'])await db.doc(`garden_reward_control/${name}_v1`).create({enabled:true,policyVersion:'legacy-v1',legacyClientRewardWritesBlocked:true});
 const base=createControlledGardenRuntime(assertLocalRewardDatabase);for(const name of ['assessment','watering','recovery'])await initializeGardenSwitch(db,base,name);
 await operator.initialize(expiry);await operator.configure(true,expiry,1);await operator.enroll(uid,true,expiry,0);
 for(const name of ['assessment','watering','recovery'])await toggle(name,true);
 service=createGardenHttpService(db,runtime,()=>new Date(now),event=>events.push(event));await startServer();
});
afterEach(async()=>{if(api){await api.close();api=undefined;}for(const child of children.splice(0)){if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}}});
after(async()=>{await db.terminate();await deleteApp(app);});

test('health and readiness disclose no project/configuration, and produce no Garden effects',async()=>{
 for(const route of ['/healthz','/readyz']){const response=await fetch(origin+route);assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});}
 assert.equal((await db.collection('garden_rate_limits').get()).size,0);assert.equal((await garden()).xp,0);
});
for(const [name,token]of [['missing',null],['malformed','not-a-token']])test(`HTTP authentication rejects ${name} token before Firestore admission`,async()=>{
 denied(await raw('/v1/watering',{requestId:randomUUID()},token),401,'invalid_authentication');assert.equal((await db.collection('garden_rate_limits').get()).size,0);
});
function alterToken(patch){const parts=tokens[uid].split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));return `${parts[0]}.${Buffer.from(JSON.stringify({...claims,...patch})).toString('base64url')}.${parts[2]}`;}
for(const [label,patch]of [['expired',{exp:1}],['wrong-project',{aud:'another-project'}],['wrong-issuer',{iss:'https://securetoken.google.com/another-project'}]])test(`Admin verifier rejects ${label} synthetic token`,async()=>{
 denied(await raw('/v1/watering',{requestId:randomUUID()},alterToken(patch)),401);assert.equal((await garden()).xp,0);
});
test('disabled Auth user is rejected by checkRevoked, without privileged client access',async()=>{
 await auth.updateUser(other,{disabled:true});try{denied(await water(randomUUID(),other),401);}finally{await auth.updateUser(other,{disabled:false});}
});
test('cross-student finalization and recovery are denied',async()=>{const id=await draft(other);denied(await finalize(id),403,'not_attempt_owner');denied(await recover(id),403,'not_attempt_owner');assert.equal(await outbox(id),undefined);});
test('unenrolled and revoked membership cannot mutate Garden',async()=>{
 const id=await draft();denied(await water(randomUUID(),other),403,'not_allowlisted');await operator.enroll(uid,false,expiry,1);
 denied(await finalize(id),403,'not_allowlisted');denied(await water(),403,'not_allowlisted');assert.equal((await garden()).xp,0);
});
test('expired rollout and malformed activation fail closed',async()=>{
 now=expiry.toMillis()+1;denied(await water(),409,'authorization_expired');now=Date.now()+1000;
 await db.doc('garden_reward_control/assessment_v1').update({unapproved:true});denied(await finalize(await draft()),409,'invalid_activation');
});
for(const [label,answers]of [['missing',[]],['partial',[{questionId:'q1',value:'x'}]],['bad-option',[{questionId:'q1',value:'x'},{questionId:'q2',value:'fabricated'}]],['duplicate',[{questionId:'q1',value:'x'},{questionId:'q1',value:'x'}]]])test(`incomplete/invalid draft ${label} never finalizes`,async()=>{
 const id=await draft(uid,1,answers);denied(await finalize(id),409);assert.equal((await read(`assessment_attempts/${id}`)).status,'in_progress');assert.equal(await outbox(id),undefined);assert.equal(await receipt(id),undefined);
});
for(const injected of [{xp:999},{studentId:other},{status:'submitted'},{score:999},{date:'2000-01-01'}])test(`identity-only finalization rejects extra field ${Object.keys(injected)[0]}`,async()=>{
 const id=await draft();denied(await raw('/v1/assessments/finalize',{attemptId:id,...injected}),400);assert.equal(await outbox(id),undefined);
});
test('valid finalization commits trusted evidence and exact reward without exposing private evidence',async()=>{
 const id=await draft(),response=await finalize(id);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.data.status,'applied');
 assert.deepEqual([(await garden()).xp,(await garden()).seeds,(await garden()).streakCount],[10,5,1]);assert.equal((await garden()).legacyBadge,'keep');
 const attempt=await db.doc(`assessment_attempts/${id}`).get(),evidence=await db.doc(`${OUTBOX}/${key(id)}`).get(),witness=await read(`garden_reward_submissions/${key(id)}`);
 assert.ok(attempt.updateTime.isEqual(evidence.createTime),'Same atomic commit must bind metadata');assert.ok(witness.submissionTime.isEqual(evidence.createTime));
 assert.equal(attempt.data().overallRiskScore,123);assert.equal(attempt.data().overallRiskLevel,'unchanged-test-value');assert.equal(attempt.data().legacyField,'preserve');
 const text=JSON.stringify(response.body);for(const secret of ['PRIVATE SYNTHETIC ANSWER','submissionHash','definitionRevision','questions','beforeUpdateTime'])assert.ok(!text.includes(secret));
});
test('concurrent finalization, same-ID retries and durable receipt return one award',async()=>{
 const id=await draft(),responses=await Promise.all([finalize(id),finalize(id)]);assert.ok(responses.every(r=>r.status===200),JSON.stringify(responses.map(r=>r.body)));
 assert.equal(responses.filter(r=>r.body.data.status==='applied').length,1);const saved=await receipt(id),balance=await garden();
 assert.equal((await finalize(id)).body.data.status,'already_applied');assert.equal((await recover(id)).body.data.status,'already_applied');
 assert.deepEqual(await receipt(id),saved);assert.deepEqual(await garden(),balance);
});
test('existing progression and multiple same-day completions preserve original policy',async()=>{
 await db.doc(`student_gardens/${uid}`).update({xp:49,seeds:7,streakCount:4,lastCheckInDate:new Date().toISOString().slice(0,10)});
 assert.equal((await finalize(await draft())).status,200);assert.deepEqual([(await garden()).level,(await garden()).xp,(await garden()).seeds,(await garden()).streakCount],[2,9,12,4]);
 assert.equal((await finalize(await draft(uid,2))).status,200);assert.deepEqual([(await garden()).xp,(await garden()).seeds,(await garden()).streakCount],[19,17,4]);
});
test('eligible missing Garden initializes atomically with reward; watering alone cannot initialize',async()=>{
 await db.doc(`student_gardens/${uid}`).delete();denied(await water(),404);assert.equal(await garden(),undefined);
 assert.equal((await finalize(await draft())).status,200);assert.deepEqual([(await garden()).level,(await garden()).xp,(await garden()).seeds],[1,10,5]);
});
test('paused assessment retains committed submission/outbox, then recovers once',async()=>{
 await toggle('assessment',false);const id=await draft(),response=await finalize(id);assert.equal(response.status,202);assert.equal(response.body.data.submissionStatus,'submitted');assert.ok(await outbox(id));assert.equal(await receipt(id),undefined);
 await toggle('assessment',true);assert.equal((await recover(id)).body.data.status,'applied');assert.equal((await recover(id)).body.data.status,'already_applied');
});
test('finalize replay cannot bypass the recovery switch or recovery admission limit',async()=>{
 const id=await draft();await finalize(id);await toggle('recovery',false);const response=await finalize(id);assert.equal(response.status,202);assert.equal(response.body.data.reward.reason,'paused');
 await toggle('recovery',true);await db.doc(ratePath(uid,'recovery')).set({schemaVersion:1,studentKey:allowlistPath(uid).split('/')[1],operation:'recovery',windowStart:Math.floor(now/60000)*60000,count:24,leases:[]});
 const limited=await finalize(id);assert.equal(limited.status,202);assert.equal(limited.body.data.reward.reason,'rate_limited');assert.equal((await garden()).xp,10);
});
test('recovery after partial finalization uses frozen definition; no second submission policy',async()=>{
 const id=await draft();const f=new GardenFinalizer(db,runtime);assert.equal(await f.submit(uid,id),true);assert.equal(await receipt(id),undefined);
 await db.doc('assessments/lesson').update({questions:[{id:'changed',type:'short_answer'}]});
 assert.equal((await recover(id)).body.data.status,'applied');assert.equal((await recover(id)).body.data.status,'already_applied');
});
test('definition changed before finalization is rejected without submitting',async()=>{
 const id=await draft();await db.doc('assessments/lesson').update({maxAttempts:2});denied(await finalize(id),409,'definition_changed_requires_review');assert.equal(await outbox(id),undefined);
});
test('client-declared submitted attempt without evidence never gains an outbox or reward',async()=>{
 const id=await draft();await db.doc(`assessment_attempts/${id}`).update({status:'submitted'});denied(await finalize(id),409,'submission_not_server_finalized');denied(await recover(id),409,'trusted_submission_witness_required');assert.equal(await outbox(id),undefined);
});
test('re-enrollment cannot revive a pending committed outbox',async()=>{
 const id=await draft();await new GardenFinalizer(db,runtime).submit(uid,id);const saved=await outbox(id);await operator.enroll(uid,false,expiry,1);await operator.enroll(uid,true,expiry,2);
 denied(await recover(id),409,'historical_enrollment');assert.deepEqual(await outbox(id),saved);assert.equal(await receipt(id),undefined);
});
test('tampered outbox is held without overwrite',async()=>{
 const id=await draft();await new GardenFinalizer(db,runtime).submit(uid,id);await db.doc(`${OUTBOX}/${key(id)}`).update({submissionHash:'a'.repeat(64)});
 denied(await recover(id),409,'outbox_conflict');assert.equal(await receipt(id),undefined);assert.equal((await garden()).xp,0);
});
test('submission/outbox transaction failure rolls both back; same ID can be retried',async()=>{
 const id=await draft();const broken=new Proxy(db,{get(target,p){if(p==='runTransaction')return cb=>target.runTransaction(async tx=>{await cb(tx);throw Error('synthetic failure');});const v=Reflect.get(target,p,target);return typeof v==='function'?v.bind(target):v;}});
 await assert.rejects(()=>new GardenFinalizer(broken,runtime).submit(uid,id),/synthetic failure/);assert.equal(await outbox(id),undefined);assert.equal((await read(`assessment_attempts/${id}`)).status,'in_progress');
 assert.equal((await finalize(id)).body.data.status,'applied');
});
test('watering, concurrent requests and old UUID replay preserve one daily award',async()=>{
 const id=randomUUID();const result=await Promise.all([water(id),water(id)]);assert.ok(result.every(r=>r.status===200));assert.equal((await garden()).xp,2);
 assert.equal((await water(id)).body.data.status,'replayed');assert.equal((await water()).body.data.status,'already_watered');assert.equal((await garden()).seeds,0);
});
test('watering UTC midnight uses server clock and old request retains original day',async()=>{
 const boundary=Math.floor(Date.now()/86400000)*86400000+86400000;now=boundary-1;const id=randomUUID(),first=await water(id);assert.equal(first.status,200);
 now=boundary+1;assert.equal((await water(id)).body.data.result.day,first.body.data.result.day);assert.equal((await garden()).xp,2);
 assert.equal((await water()).status,200);assert.equal((await garden()).xp,4);
});
test('watering pause and quota exhaustion cannot alter earned balances',async()=>{
 await toggle('watering',false);denied(await water(),503,'paused');await toggle('watering',true);
 for(let n=0;n<12;n++)assert.equal((await water()).status,200);const response=await water();denied(response,429,'rate_limited');assert.ok(Number(response.headers.get('retry-after'))>0);assert.equal((await garden()).xp,2);
});
for(const [label,options,expected]of [['method',{method:'PUT'},405],['content-type',{headers:{Authorization:'Bearer placeholder','Content-Type':'text/plain'}},401],['origin',{headers:{Origin:'https://unapproved.invalid'}},403]])test(`HTTP protocol rejects ${label}`,async()=>{
 const response=await raw('/v1/watering',{requestId:randomUUID()},tokens[uid],options);denied(response,expected);
});
test('unsupported content type, oversized body, bad JSON and administrative paths fail safely',async()=>{
 denied(await raw('/v1/watering',{},tokens[uid],{headers:{Authorization:`Bearer ${tokens[uid]}`,'Content-Type':'text/plain'}}),415);
 denied(await raw('/v1/watering',{padding:'x'.repeat(5000)}),413);
 const response=await fetch(origin+'/v1/watering',{method:'POST',headers:{Authorization:`Bearer ${tokens[uid]}`,'Content-Type':'application/json'},body:'{'});assert.equal(response.status,400);
 denied(await raw('/v1/activate',{enabled:true}),404);assert.equal((await garden()).xp,0);
});
test('unexpected service error and readiness failure never expose stack/private information',async()=>{
 await api.close();const failure=Error('PRIVATE SYNTHETIC SECRET');await startServer({execute:async()=>{throw failure;},ready:async()=>{throw failure;}});
 const response=await water();denied(response,503,'backend_unavailable');assert.ok(!JSON.stringify(response.body).includes(failure.message));
 const ready=await fetch(origin+'/readyz');assert.equal(ready.status,503);assert.ok(!JSON.stringify(await ready.json()).includes(failure.message));
});
test('bounded server timeout returns unknown while same operation may finish',async()=>{
 await api.close();let completed=false;await startServer({ready:async()=>{},execute:async()=>{await new Promise(r=>setTimeout(r,80));completed=true;return{};}},20);
 const response=await water();denied(response,504,'outcome_unknown');await api.close();api=undefined;assert.equal(completed,true);
});
test('host transport refuses redirects before any token reaches another listener',async()=>{
 let received=0;const target=http.createServer((_q,r)=>{received++;r.end('{}');});await new Promise(r=>target.listen(0,'127.0.0.1',r));
 const redirect=http.createServer((_q,r)=>{r.writeHead(307,{Location:`http://127.0.0.1:${target.address().port}/stolen`});r.end();});await new Promise(r=>redirect.listen(0,'127.0.0.1',r));
 try{const transport=new HostGardenClient({origin:`http://127.0.0.1:${redirect.address().port}`,local:true,user:()=>({uid,token:async()=>tokens[uid]}),terminals:{read:async()=>false,write:async()=>{}}});
 await assert.rejects(()=>transport.invoke('waterGarden',{requestId:randomUUID()}),e=>e.reason==='outcome_unknown');assert.equal(received,0);
 }finally{await new Promise(r=>redirect.close(r));await new Promise(r=>target.close(r));}
});
test('host client rejects unapproved origins and session switches without sending a request',async()=>{
 const options={user:()=>undefined,terminals:{read:async()=>false,write:async()=>{}}};
 for(const value of ['http://external.invalid','https://user:secret@external.invalid','https://external.invalid/path','https://external.invalid/?redirect=x'])assert.throws(()=>new HostGardenClient({...options,origin:value}));
 let user=uid;const transport=new HostGardenClient({origin,local:true,user:()=>({uid:user,token:async()=>{user=other;return tokens[uid];}}),terminals:options.terminals});
 await assert.rejects(()=>transport.invoke('waterGarden',{requestId:randomUUID()}),e=>e.reason==='session_changed');assert.equal((await garden()).xp,0);
});
test('host cold-start timeout remains retryable and uses no polling loop',async()=>{
 const slow=http.createServer((_q,r)=>{setTimeout(()=>r.end('{}'),80);});await new Promise(r=>slow.listen(0,'127.0.0.1',r));let reads=0;
 try{const transport=new HostGardenClient({origin:`http://127.0.0.1:${slow.address().port}`,local:true,timeoutMs:15,user:()=>({uid,token:async()=>{reads++;return tokens[uid];}}),terminals:{read:async()=>false,write:async()=>{}}});
 await assert.rejects(()=>transport.invoke('waterGarden',{requestId:randomUUID()}),e=>e.retryable===true&&e.reason==='outcome_unknown');assert.equal(reads,1);
 }finally{slow.closeAllConnections();await new Promise(r=>slow.close(r));}
});
test('terminal assessment rejection remains held across transport instances',async()=>{
 const terminals=new Map(),transport=hostClient(uid,75000,terminals),id=await draft(uid,1,[]);
 await assert.rejects(()=>transport.invoke('finalizeAssessment',{attemptId:id}),e=>e.status===409);const count=(await read(ratePath(uid,'assessment'))).count;
 await assert.rejects(()=>hostClient(uid,75000,terminals).invoke('finalizeAssessment',{attemptId:id}),e=>e.reason==='review_required');assert.equal((await read(ratePath(uid,'assessment'))).count,count);
});
test('HTTP response lost after committed reward retries the same ID without another award',async()=>{
 const id=await draft();await new Promise((resolve,reject)=>{const request=http.request(origin+'/v1/assessments/finalize',{method:'POST',headers:{Authorization:`Bearer ${tokens[uid]}`,'Content-Type':'application/json'}},response=>{response.destroy();resolve();});request.on('error',reject);request.end(JSON.stringify({attemptId:id}));});
 const saved=await receipt(id);assert.ok(saved);assert.equal((await recover(id)).body.data.status,'already_applied');assert.deepEqual(await receipt(id),saved);assert.equal((await garden()).xp,10);
});
async function childServer(crash=false){const child=cp.fork(path.join(__dirname,'fixtures/external-server.cjs'),crash?['--crash-after-submission']:[],{env:process.env,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});children.push(child);
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Synthetic child readiness timed out')),15000);child.on('message',message=>{if(message.ready){clearTimeout(timeout);resolve();}});child.once('exit',code=>{clearTimeout(timeout);reject(Error(`Synthetic child exited ${code}`));});});return child;}
test('real backend process crash after atomic submission recovers from Firestore after restart',{timeout:45000},async()=>{
 const id=await draft(),child=await childServer(true);const exited=new Promise(resolve=>child.once('exit',resolve));
 await assert.rejects(()=>fetch('http://127.0.0.1:18090/v1/assessments/finalize',{method:'POST',headers:{Authorization:`Bearer ${tokens[uid]}`,'Content-Type':'application/json'},body:JSON.stringify({attemptId:id})}));await exited;
 assert.ok(await outbox(id));assert.equal(await receipt(id),undefined);await childServer(false);
 const response=await fetch('http://127.0.0.1:18090/v1/assessments/recover',{method:'POST',headers:{Authorization:`Bearer ${tokens[uid]}`,'Content-Type':'application/json'},body:JSON.stringify({attemptId:id})});
 assert.equal(response.status,200);assert.equal((await response.json()).data.status,'applied');assert.equal((await garden()).xp,10);
});
test('client rules deny the new outbox and preserve Garden initialization/Forest notes',async()=>{
 const id=await draft(),a=clientApp.initializeApp({projectId:project,apiKey:'synthetic'},randomUUID()),d=client.initializeFirestore(a,{localCache:client.memoryLocalCache()});client.connectFirestoreEmulator(d,'127.0.0.1',18088,{mockUserToken:{sub:uid,user_id:uid}});client.setLogLevel('silent');
 try{const ref=client.doc(d,OUTBOX,key(id));for(const action of [()=>client.getDoc(ref),()=>client.setDoc(ref,{enabled:true}),()=>client.updateDoc(ref,{enabled:true}),()=>client.deleteDoc(ref)])await assert.rejects(action,e=>e.code==='permission-denied');
 const note=client.doc(d,'forest_notes',id);await client.setDoc(note,{studentId:uid,attemptId:id,note:'Synthetic tree',createdAt:client.serverTimestamp(),updatedAt:client.serverTimestamp()});await client.updateDoc(note,{note:'Edited',updatedAt:client.serverTimestamp()});assert.equal((await client.getDoc(note)).data().note,'Edited');
 await db.doc(`student_gardens/${uid}`).delete();const g=client.doc(d,'student_gardens',uid);await client.setDoc(g,{studentId:uid,level:1,xp:0,seeds:0,streakCount:0,lastCheckInDate:'',lastWateredDate:'',createdAt:client.serverTimestamp(),updatedAt:client.serverTimestamp()});assert.equal((await client.getDoc(g)).data().xp,0);
 await assert.rejects(()=>client.updateDoc(g,{xp:999}),e=>e.code==='permission-denied');await assert.rejects(()=>client.getDoc(client.doc(d,'student_gardens',other)),e=>e.code==='permission-denied');
 }finally{await client.terminate(d);await clientApp.deleteApp(a);}
});
test('hosted configuration cannot silently select production or fall back from missing emulators',()=>{
 for(const env of [{},{GARDEN_HTTP_MODE:'local',GCLOUD_PROJECT:project},{GARDEN_HTTP_MODE:'hosted',GCLOUD_PROJECT:'spartan-g-a2d80'}])assert.throws(()=>externalConfiguration(env));
 const cfg=externalConfiguration({GARDEN_HTTP_MODE:'local',GCLOUD_PROJECT:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:18088',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:19097'});assert.equal(cfg.host,'127.0.0.1');
});
test('structured audit contains fixed reasons and pseudonyms without answers/tokens',async()=>{
 const id=await draft();await finalize(id);await raw('/v1/watering',{},null);await water(randomUUID(),other);
 const text=JSON.stringify(events);for(const secret of [tokens[uid],uid,other,'PRIVATE SYNTHETIC ANSWER'])assert.ok(!text.includes(secret));
 for(const event of ['submission_captured','assessment_completed','authorization_denied','unauthenticated'])assert.ok(events.some(e=>e.event===event));
});

test('Admin verification failure is fail-closed, requests revocation checks, and hides SDK details',async()=>{
 let called=false;const verifier=createTokenVerifier({verifyIdToken:async(token,checkRevoked)=>{
  called=true;assert.equal(token,'synthetic.jwt.value');assert.equal(checkRevoked,true);throw Error('PRIVATE SDK DETAILS');
 }},project);
 await assert.rejects(()=>verifier({rawHeaders:['Authorization','Bearer synthetic.jwt.value'],headers:{authorization:'Bearer synthetic.jwt.value'}}),e=>e.status===401&&!e.message.includes('PRIVATE'));
 assert.ok(called);
});

test('revoked synthetic Auth token is rejected without creating a rate-limit document',async()=>{
 const user='http-revoked-only';await auth.createUser({uid:user,email:`${user}@example.invalid`,password:randomUUID()});
 try{
  const custom=await auth.createCustomToken(user),response=await fetch('http://127.0.0.1:19097/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:custom,returnSecureToken:true})});
  const token=(await response.json()).idToken,parts=token.split('.'),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  // Emulator tokens are unsigned; this tests its auth_time/revocation path, not production signatures.
  claims.auth_time=1;const old=`${parts[0]}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${parts[2]}`;
  await auth.revokeRefreshTokens(user);denied(await raw('/v1/watering',{requestId:randomUUID()},old),401);
  assert.equal((await db.collection('garden_rate_limits').get()).size,0);
 }finally{await auth.deleteUser(user);}
});

test('canonical identity, inactive profiles and attempt limits cannot be bypassed',async()=>{
 const id=await draft();await db.doc(`assessment_attempts/${id}`).update({attemptNumber:2});denied(await finalize(id),409,'attempt_identity_mismatch');
 await db.doc(`assessment_attempts/${id}`).update({attemptNumber:1});await db.doc(`users/${uid}`).update({isActive:false});denied(await finalize(id),403,'active_student_required');
 await db.doc(`users/${uid}`).update({isActive:true});const over=await draft(uid,4);denied(await finalize(over),409,'attempt_limit_exceeded');
 assert.equal(await outbox(id),undefined);assert.equal(await outbox(over),undefined);assert.equal((await garden()).xp,0);
});

test('a draft created before enrollment stays historical even when no receipt exists',async()=>{
 const id=await draft(other);await operator.enroll(other,true,expiry,0);denied(await finalize(id,other),409,'historical_enrollment');
 assert.equal(await outbox(id),undefined);assert.equal(await receipt(id),undefined);assert.equal(await read(`student_gardens/${other}`),undefined);
});

test('changed answers after finalization are held and cannot create a reward',async()=>{
 const id=await draft();await new GardenFinalizer(db,runtime).submit(uid,id);
 await db.doc(`assessment_attempts/${id}`).update({answers:[{questionId:'q1',value:'CHANGED'},{questionId:'q2',value:'yes'}]});
 denied(await recover(id),409,'submission_changed');assert.equal(await receipt(id),undefined);assert.equal((await garden()).xp,0);
});

test('a conflicting durable receipt is never overwritten or rewarded again',async()=>{
 const id=await draft();await finalize(id);await db.doc(`garden_reward_receipts/${key(id)}`).update({submissionHash:'b'.repeat(64)});
 const saved=await receipt(id),balance=await garden();denied(await recover(id),409,'receipt_conflict');assert.deepEqual(await receipt(id),saved);assert.deepEqual(await garden(),balance);
});

test('duplicate Authorization headers and chunked oversize bodies are denied before service mutation',async()=>{
 async function request(headers,chunks){return new Promise((resolve,reject)=>{
  const q=http.request(origin+'/v1/watering',{method:'POST',headers:Array.isArray(headers)?['Host',new URL(origin).host,...headers]:headers},r=>{let text='';r.on('data',c=>text+=c);r.on('end',()=>{try{resolve({status:r.statusCode,body:JSON.parse(text)});}catch(error){reject(error);}});});
  q.on('error',reject);for(const chunk of chunks)q.write(chunk);q.end();
 });}
 denied(await request(['Authorization',`Bearer ${tokens[uid]}`,'Authorization',`Bearer ${tokens[uid]}`,'Content-Type','application/json'],['{}']),401);
 denied(await request({'Authorization':`Bearer ${tokens[uid]}`,'Content-Type':'application/json','Transfer-Encoding':'chunked'},['{"padding":"','x'.repeat(5000),'"}']),413);
 assert.equal((await db.collection('garden_rate_limits').get()).size,0);assert.equal((await garden()).xp,0);
});

test('HTTP in-flight limit rejects excess work and graceful shutdown drains accepted work',async()=>{
 await api.close();let release,started=0;const hold=new Promise(r=>{release=r;});
 await startServer({execute:async()=>{started++;await hold;return {status:'test'};},ready:async()=>{}});
 const requests=Array.from({length:16},()=>water());
 try{
  for(let n=0;n<200&&started!==16;n++)await new Promise(r=>setTimeout(r,10));assert.equal(started,16);
  denied(await water(),503,'server_busy');assert.equal(started,16);
 }finally{release();await Promise.all(requests);}
});

test('oversized server response is bounded and reveals no private payload',async()=>{
 await api.close();await startServer({execute:async()=>({private:'x'.repeat(17000)}),ready:async()=>{}});
 const result=await water();denied(result,503,'response_unavailable');assert.ok(JSON.stringify(result.body).length<1000);
});

test('host transport refuses malformed and oversized responses without automatic retries',async()=>{
 for(const payload of ['{','x'.repeat(17000)]){
  let count=0;const target=http.createServer((_q,r)=>{count++;r.end(payload);});await new Promise(r=>target.listen(0,'127.0.0.1',r));
  try{
   const transport=new HostGardenClient({origin:`http://127.0.0.1:${target.address().port}`,local:true,user:()=>({uid,token:async()=>tokens[uid]}),terminals:{read:async()=>false,write:async()=>{}}});
   await assert.rejects(()=>transport.invoke('waterGarden',{requestId:randomUUID()}),e=>e.reason==='invalid_response'&&e.retryable);assert.equal(count,1);
  }finally{target.closeAllConnections();await new Promise(r=>target.close(r));}
 }
});

test('host timeout during response streaming remains an unknown retryable outcome',async()=>{
 const target=http.createServer((_q,r)=>{r.writeHead(200,{'Content-Type':'application/json'});r.write('{');});await new Promise(r=>target.listen(0,'127.0.0.1',r));
 try{
  const transport=new HostGardenClient({origin:`http://127.0.0.1:${target.address().port}`,local:true,timeoutMs:50,user:()=>({uid,token:async()=>tokens[uid]}),terminals:{read:async()=>false,write:async()=>{}}});
  await assert.rejects(()=>transport.invoke('waterGarden',{requestId:randomUUID()}),e=>e.reason==='outcome_unknown'&&e.retryable);
 }finally{target.closeAllConnections();await new Promise(r=>target.close(r));}
});

test('existing pending-operation coordinator retains UUID through a lost response and host restart',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
 const source=fs.readFileSync(path.resolve(__dirname,'../../packages/shared-services/src/services/garden-operations.client.ts'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,Set,Map,Promise,Object,Error,String});
 const {GardenOperationsClient}=module.exports,saved=new Map(),requests=[];let lose=true;
 const storage={read:async u=>saved.get(u)??null,write:async(u,v)=>saved.set(u,JSON.parse(JSON.stringify(v)))};
 const dependencies={storage,currentUid:()=>uid,requestId:()=>{const id=randomUUID();requests.push(id);return id;},invoke:async(name,data)=>{
  const result=await hostClient().invoke(name,data);if(lose){lose=false;throw Object.assign(Error('Lost response'),{code:'unavailable'});}return result;
 }};
 const first=new GardenOperationsClient(dependencies);assert.equal((await first.water(uid)).status,'pending');assert.equal((await garden()).xp,2);
 const retained=saved.get(uid).wateringRequestId;assert.equal(retained,requests[0]);
 const second=new GardenOperationsClient({...dependencies,invoke:(name,data)=>hostClient().invoke(name,data)});await second.hydrate(uid);
 assert.equal((await second.water(uid)).status,'confirmed');assert.equal(saved.get(uid).wateringRequestId,undefined);assert.equal(requests.length,1);assert.equal((await garden()).xp,2);
});

test('real entry refuses unavailable emulators before SDK initialization without binding or production fallback',async()=>{
 const result=await new Promise((resolve,reject)=>{const p=cp.spawn(process.execPath,[path.resolve(__dirname,'../lib/external-garden.js')],{
  cwd:path.resolve(__dirname,'..'),env:{...process.env,GARDEN_HTTP_MODE:'local',GCLOUD_PROJECT:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:1',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:1',PORT:'18090'},
  windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',x=>output+=x);p.stderr.on('data',x=>output+=x);p.once('error',reject);p.once('exit',code=>resolve({code,output}));
 });assert.equal(result.code,1);assert.match(result.output,/Garden HTTP startup failed/);assert.ok(!result.output.includes('PRIVATE'));
});

test('local startup probes refuse redirect destinations before SDK initialization',async()=>{
 let followed=0;const target=http.createServer((_q,r)=>{followed++;r.end('{}');});await new Promise(r=>target.listen(0,'127.0.0.1',r));
 const redirect=http.createServer((_q,r)=>{r.writeHead(307,{Location:`http://127.0.0.1:${target.address().port}/`});r.end();});await new Promise(r=>redirect.listen(0,'127.0.0.1',r));
 try{
  const result=await new Promise((resolve,reject)=>{const p=cp.spawn(process.execPath,[path.resolve(__dirname,'../lib/external-garden.js')],{
   env:{...process.env,GARDEN_HTTP_MODE:'local',GCLOUD_PROJECT:project,FIRESTORE_EMULATOR_HOST:`127.0.0.1:${redirect.address().port}`,FIREBASE_AUTH_EMULATOR_HOST:`127.0.0.1:${redirect.address().port}`,PORT:'18090'},
   windowsHide:true,stdio:'ignore'});p.once('error',reject);p.once('exit',resolve);
  });assert.equal(result,1);assert.equal(followed,0);
 }finally{await new Promise(r=>redirect.close(r));await new Promise(r=>target.close(r));}
});
