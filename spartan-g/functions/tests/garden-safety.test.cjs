// Synthetic Firestore only. Existing domain/rule/regression sources stay unchanged.
const {test,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const clientApp=require('firebase/app'),client=require('firebase/firestore');
const {AssessmentRewardProcessor,trustedSnapshot}=require('../lib/garden-rewards/processor');
const {GardenWateringProcessor}=require('../lib/garden-watering/processor');
const {createSafetyControlledGardenRuntime,GARDEN_REQUEST_LIMITS,ratePath}=require('../lib/garden-production/safety');
const {createGardenOperator,ROLLOUT_PATH,allowlistPath}=require('../lib/garden-production/rollout');
const {createControlledGardenRuntime,initializeGardenSwitch,switchPath}=require('../lib/garden-production/activation');
const {createControlledGardenFunctions}=require('../lib/garden-production/functions');
const {assertLocalRewardDatabase}=require('../lib/garden-rewards/local-safety');
const {operationId}=require('../lib/garden-rewards/eligibility');
const {gardenAudit,boundedAuditSink}=require('../lib/garden-production/audit');
const {wateringOperationId}=require('../lib/garden-watering/validation');
const project='demo-spartan-g-garden-phase2',port=18086,uid='synthetic-student-a',other='synthetic-student-b';
assert.equal(process.env.GCLOUD_PROJECT,project);assert.equal(process.env.FIRESTORE_EMULATOR_HOST,`127.0.0.1:${port}`);
const app=initializeApp({projectId:project},'garden-safety'),db=getFirestore(app),clients=[];
let now,events,runtime,operator,rewards,water,handlers,expiry;
const read=async path=>(await db.doc(path).get()).data();
const garden=()=>read(`student_gardens/${uid}`);
const reason=name=>error=>error.reason===name||error.details?.reason===name;
async function toggle(kind,enabled){const data=await read(switchPath(kind));return operator.setSwitch(kind,enabled,data.revision);}
async function enroll(student=uid,enabled=true){const data=await read(allowlistPath(student));return operator.enroll(student,enabled,expiry,data?.revision??0);}
async function enable(){await operator.initialize(expiry);await operator.configure(true,expiry,1);await enroll();for(const kind of ['assessment','recovery','watering'])await toggle(kind,true);}
async function existing(extra={}){await db.doc(`student_gardens/${uid}`).create({studentId:uid,level:1,xp:0,seeds:0,streakCount:0,lastCheckInDate:'',lastWateredDate:'',createdAt:Timestamp.fromMillis(1000),updatedAt:Timestamp.fromMillis(1000),...extra});}
async function start(student=uid,n=1){const id=`lesson_${student}_${n}`,ref=db.doc(`assessment_attempts/${id}`);await ref.create({assessmentId:'lesson',studentId:student,attemptNumber:n,status:'in_progress',answers:[]});return ref.get();}
async function submitted(before){await before.ref.update({status:'submitted',answers:[{questionId:'q1',value:'SYNTHETIC PRIVATE ANSWER'}]});return{before,after:await before.ref.get()};}
const capture=change=>rewards.captureSubmission(trustedSnapshot(change.before),trustedSnapshot(change.after));
const trigger=change=>handlers.assessmentSubmitted.run({data:change,params:{attemptId:change.after.id},id:randomUUID(),specversion:'1.0',source:'synthetic-loopback',type:'google.cloud.firestore.document.v1.updated',time:new Date().toISOString()});
const recover=(attemptId,owner=uid,data={attemptId})=>handlers.recoverAssessmentReward.run({data,auth:{uid:owner,token:{sub:owner}}});
const callWater=(data={requestId:randomUUID()},owner=uid)=>handlers.waterGarden.run({data,auth:owner?{uid:owner,token:{sub:owner}}:undefined});
beforeEach(async()=>{
 assert.ok((await fetch(`http://127.0.0.1:${port}/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE'})).ok);
 now=Date.now()+1000;expiry=Timestamp.fromMillis(now+3600000);events=[];
 runtime=createSafetyControlledGardenRuntime(assertLocalRewardDatabase,()=>new Date(now));
 operator=createGardenOperator(db,runtime,()=>new Date(now),event=>events.push(event));
 rewards=new AssessmentRewardProcessor(db,runtime);water=new GardenWateringProcessor(db,()=>new Date(now),runtime);
 handlers=createControlledGardenFunctions(db,runtime,event=>events.push(event));
 for(const [id,role,isActive]of[[uid,'student',true],[other,'student',true],['staff','facilitator',true],['admin','super_admin',true],['inactive','student',false]])await db.doc(`users/${id}`).create({uid:id,role,isActive});
 await db.doc('assessments/lesson').create({courseId:'course',facilitatorId:'staff',isPublished:true,maxAttempts:10,questions:[{id:'q1',type:'short_answer',text:'Synthetic only'}]});
 const base=createControlledGardenRuntime(assertLocalRewardDatabase);
 for(const kind of ['assessment','watering'])await db.doc(`garden_reward_control/${kind}_v1`).create({enabled:true,policyVersion:'legacy-v1',legacyClientRewardWritesBlocked:true});
 for(const kind of ['assessment','watering','recovery'])await initializeGardenSwitch(db,base,kind);
});
after(async()=>{for(const item of clients){await client.terminate(item.db);await clientApp.deleteApp(item.app);}await db.terminate();await deleteApp(app);});

test('missing rollout and disabled switches fail closed without automatic controls or Garden writes',async()=>{
 await existing();await toggle('watering',true);await assert.rejects(()=>callWater(),reason('rollout_unavailable'));
 assert.equal(await read(ROLLOUT_PATH),undefined);assert.equal((await garden()).xp,0);assert.equal((await db.collection('garden_rate_limits').get()).size,0);
});
test('operator initialization is disabled; enable still requires membership',async()=>{
 await existing();await operator.initialize(expiry);assert.equal((await read(ROLLOUT_PATH)).enabled,false);
 await operator.configure(true,expiry,1);await toggle('watering',true);await assert.rejects(()=>callWater(),reason('not_allowlisted'));
});
test('allowlisted trusted trigger grants exact assessment policy and no duplicate award',async()=>{
 await enable();const change=await submitted(await start());assert.equal((await trigger(change)).status,'applied');
 assert.deepEqual([(await garden()).xp,(await garden()).seeds,(await garden()).level,(await garden()).streakCount],[10,5,1,1]);
 assert.equal((await trigger(change)).status,'already_applied');assert.equal((await garden()).xp,10);
});
test('unlisted event identity is rejected even when general switches are enabled',async()=>{
 await enable();const change=await submitted(await start(other));const result=await trigger(change);
 assert.equal(result.status,'rejected');assert.equal(result.reason,'not_allowlisted');assert.equal(await read(`student_gardens/${other}`),undefined);
 assert.equal(await read(`garden_reward_submissions/${operationId(change.after.id)}`),undefined);
});
test('non-allowlisted watering and owner recovery are denied without new rate documents',async()=>{
 await enable();await assert.rejects(()=>callWater({requestId:randomUUID()},other),reason('not_allowlisted'));
 await assert.rejects(()=>recover(`lesson_${other}_1`,other),reason('not_allowlisted'));assert.equal(await read(ratePath(other,'watering')),undefined);
});
test('allowlisted callers cannot inject an owner or impersonate another enrolled account',async()=>{
 await enable();await existing();await enroll(other);const change=await submitted(await start());await capture(change);
 await assert.rejects(()=>recover(change.after.id,other),e=>e.code==='permission-denied');
 await assert.rejects(()=>callWater({requestId:randomUUID(),studentId:uid},other),e=>e.code==='invalid-argument');assert.equal((await garden()).xp,0);
});
 for(const [name,patch]of[['missing field',{expiresAt:undefined}],['wrong mode',{mode:'all_students'}],['wrong schema',{schemaVersion:99}],['extra field',{allowAll:true}],['invalid revision',{revision:0}],['wrong epoch',{assessmentEpochAt:Timestamp.fromMillis(1)}],['wrong other epoch',{wateringEpochAt:Timestamp.fromMillis(1)}]]){
 test(`malformed/obsolete rollout ${name} fails closed`,async()=>{
  await enable();await existing();const doc=await read(ROLLOUT_PATH);const merged={...doc,...patch};for(const key of Object.keys(merged))if(merged[key]===undefined)delete merged[key];await db.doc(ROLLOUT_PATH).set(merged);
  const attempt=await start();await assert.rejects(()=>rewards.applyReward(attempt.id),e=>!!e.reason);assert.equal((await garden()).xp,0);
 });
}
test('rollout expiry fails closed without mutation',async()=>{await enable();await existing();now=expiry.toMillis();await assert.rejects(()=>callWater(),reason('authorization_expired'));assert.equal((await garden()).xp,0);});
test('individual allowlist expiry fails closed',async()=>{await enable();await existing();const short=Timestamp.fromMillis(now+10000);await operator.enroll(uid,true,short,1);now+=10001;await assert.rejects(()=>callWater(),reason('authorization_expired'));});
test('missing, malformed and obsolete membership bindings fail closed',async()=>{
 await enable();await existing();await db.doc(allowlistPath(uid)).update({rolloutRevision:500});await assert.rejects(()=>callWater(),reason('obsolete_authorization'));
 await db.doc(allowlistPath(uid)).update({studentId:other});await assert.rejects(()=>callWater(),reason('invalid_safety_configuration'));
});
test('historical epoch and later allowlist enrollment both reject old attempts',async()=>{
 const historical=await start();await enable();await assert.rejects(async()=>capture(await submitted(historical)),reason('historical_enrollment'));
 assert.equal(await garden(),undefined);assert.equal((await db.collection('garden_reward_receipts').get()).size,0);
});
test('adding an eligible student later cannot authorize their already submitted attempt',async()=>{
 await enable();const before=await start(other),change=await submitted(before);await enroll(other);
 await assert.rejects(()=>capture(change),reason('historical_enrollment'));
});
test('attempt created before the immutable epoch stays historical even if enrollment is valid later',async()=>{
 await db.doc('garden_reward_control/assessment_v1').delete();const old=await start();
 await db.doc('garden_reward_control/assessment_v1').create({enabled:true,policyVersion:'legacy-v1',legacyClientRewardWritesBlocked:true});
 // Rebind the synthetic switch to the newly prepared epoch, never a production reset.
 await db.doc(switchPath('assessment')).delete();await db.doc(switchPath('recovery')).delete();
 const base=createControlledGardenRuntime(assertLocalRewardDatabase);await initializeGardenSwitch(db,base,'assessment');await initializeGardenSwitch(db,base,'recovery');
 await enable();await assert.rejects(async()=>capture(await submitted(old)),reason('historical_enrollment'));assert.equal(await garden(),undefined);
});
test('expired rollout renewal requires new memberships and cannot reward earlier attempts',async()=>{
 await enable();const old=await submitted(await start());await capture(old);const epoch=await db.doc('garden_reward_control/assessment_v1').get();
 now=expiry.toMillis()+1;expiry=Timestamp.fromMillis(now+3600000);const cfg=await read(ROLLOUT_PATH);
 await operator.configure(true,expiry,cfg.revision);await assert.rejects(()=>recover(old.after.id),reason('obsolete_authorization'));
 await enroll();await assert.rejects(()=>recover(old.after.id),reason('historical_enrollment'));
 assert.ok(epoch.createTime.isEqual((await db.doc('garden_reward_control/assessment_v1').get()).updateTime));
});
test('removal blocks new mutations and preserves applied receipts/balances',async()=>{
 await enable();const change=await submitted(await start());await trigger(change);const prior=await garden(),receipt=await read(`garden_reward_receipts/${operationId(change.after.id)}`);
 await enroll(uid,false);await assert.rejects(()=>callWater(),reason('not_allowlisted'));await assert.rejects(()=>recover(change.after.id),reason('not_allowlisted'));
 assert.deepEqual(await garden(),prior);assert.deepEqual(await read(`garden_reward_receipts/${operationId(change.after.id)}`),receipt);
});
test('re-enrollment and rollout revision changes cannot backfill an unpaid witnessed attempt',async()=>{
 await enable();const change=await submitted(await start());await capture(change);await enroll(uid,false);await enroll(uid,true);
 await assert.rejects(()=>recover(change.after.id),reason('historical_enrollment'));
 const cfg=await read(ROLLOUT_PATH);await operator.configure(true,expiry,cfg.revision);
 await assert.rejects(()=>callWater(),reason('obsolete_authorization'));assert.equal(await garden(),undefined);
});
test('pending proof survives removal and re-enrollment while denial audit stays pseudonymous and bounded',async()=>{
 await enable();await existing({xp:17,seeds:23,streakCount:3});
 const change=await submitted(await start());await capture(change);
 const key=operationId(change.after.id),proofPath=`garden_reward_submissions/${key}`,receiptPath=`garden_reward_receipts/${key}`;
 const priorGarden=await garden(),priorProof=await read(proofPath);assert.ok(priorProof);
 await enroll(uid,false);await assert.rejects(()=>recover(change.after.id),reason('not_allowlisted'));
 await enroll(uid,true);await assert.rejects(()=>recover(change.after.id),reason('historical_enrollment'));
 assert.deepEqual(await garden(),priorGarden);assert.deepEqual(await read(proofPath),priorProof);assert.equal(await read(receiptPath),undefined);
 const denials=events.filter(event=>event.event==='authorization_denied');
 assert.deepEqual(denials.map(event=>event.reason),['not_allowlisted','historical_enrollment']);
 for(const event of denials){
  assert.deepEqual(Object.keys(event).sort(),['event','operation','reason','schemaVersion','studentKey']);
  assert.equal(event.studentKey,allowlistPath(uid).split('/')[1]);assert.equal(event.operation,'recovery');assert.equal(event.schemaVersion,1);
 }
 const audit=JSON.stringify(denials);for(const value of [uid,change.after.id,'SYNTHETIC PRIVATE ANSWER'])assert.ok(!audit.includes(value));
});
test('watering preserves seeds/streaks, original UUID replay and daily marker',async()=>{
 await enable();await existing({xp:49,seeds:9,streakCount:5,lastCheckInDate:'2000-01-01'});const id=randomUUID();
 assert.equal((await callWater({requestId:id})).status,'rewarded');assert.equal((await callWater({requestId:id})).status,'replayed');
 assert.equal((await callWater()).status,'already_watered');assert.deepEqual([(await garden()).xp,(await garden()).level,(await garden()).seeds,(await garden()).streakCount],[1,2,9,5]);
});
test('recovery and concurrent trigger requests remain transactionally idempotent',async()=>{
 await enable();const change=await submitted(await start());await capture(change);
 const results=await Promise.all([recover(change.after.id),recover(change.after.id)]);assert.equal(results.filter(r=>r.status==='applied').length,1);assert.equal((await garden()).xp,10);
});
test('watering throttles a unique-UUID flood; stable rate storage and receipts survive refill',async()=>{
 await enable();await existing();for(let i=0;i<GARDEN_REQUEST_LIMITS.watering;i++)await callWater();
 await assert.rejects(()=>callWater(),e=>e.code==='resource-exhausted'&&e.details.retryAfterSeconds>0&&e.details.retryable);
 const count=(await db.collection('garden_reward_receipts').get()).size;now+=61000;await callWater();assert.equal((await garden()).xp,2);
 assert.equal((await db.collection('garden_rate_limits').get()).size,1);assert.equal((await db.collection('garden_reward_receipts').get()).size,count+1);
});
test('malformed requests consume bounded admission budget without Garden/receipt changes',async()=>{
 await enable();await existing();for(let i=0;i<GARDEN_REQUEST_LIMITS.watering;i++)await assert.rejects(()=>callWater({requestId:'bad',answers:'never log'}),e=>e.code==='invalid-argument');
 await assert.rejects(()=>callWater({}),e=>e.code==='resource-exhausted');assert.equal((await garden()).xp,0);assert.equal((await db.collection('garden_reward_receipts').get()).size,0);
});
test('recovery has a separate per-user budget and bounded retry response',async()=>{
 await enable();for(let i=0;i<GARDEN_REQUEST_LIMITS.recovery;i++)await assert.rejects(()=>recover('bad',uid,{}),e=>e.code==='invalid-argument');
 await assert.rejects(()=>recover('bad'),e=>e.code==='resource-exhausted'&&e.details.retryAfterSeconds<=60);
});
test('unexpected trigger retries are throttled without creating an applied receipt',async()=>{
 await enable();for(let i=0;i<GARDEN_REQUEST_LIMITS.assessment;i++)await runtime.withAdmission(db,'assessment',uid,async()=>{});
 const change=await submitted(await start());await assert.rejects(()=>trigger(change),reason('rate_limited'));
 assert.equal(await read(`garden_reward_receipts/${operationId(change.after.id)}`),undefined);
 now+=61000;assert.equal((await trigger(change)).status,'applied');assert.equal((await garden()).xp,10);
});
for(const patch of [{count:-1},{leases:[{id:'not-a-lease',until:1}]},{windowStart:1}])test(`malformed server throttle state fails closed: ${JSON.stringify(patch)}`,async()=>{
 await enable();await existing();await callWater();await db.doc(ratePath(uid,'watering')).update(patch);
 await assert.rejects(()=>callWater(),reason('invalid_safety_configuration'));assert.equal((await garden()).xp,2);
});
test('distributed in-flight admission rejects excess concurrency and releases on failure',async()=>{
 await enable();let release;const barrier=new Promise(r=>release=r);let entered=0;const work=()=>runtime.withAdmission(db,'watering',uid,async()=>{entered++;await barrier;});
 const a=work(),b=work();while(entered<2)await new Promise(r=>setTimeout(r,5));
 await assert.rejects(()=>runtime.withAdmission(db,'watering',uid,async()=>{}),reason('concurrency_limited'));release();await Promise.all([a,b]);
 await assert.rejects(()=>runtime.withAdmission(db,'watering',uid,async()=>{throw Error('synthetic failure');}),/synthetic failure/);
 assert.equal((await read(ratePath(uid,'watering'))).leases.length,0);
});
test('crash leases expire without clearing durable receipts or rate history',async()=>{
 await enable();await existing();await callWater();const saved=await read(ratePath(uid,'watering'));
 await db.doc(ratePath(uid,'watering')).update({leases:[{id:randomUUID(),until:saved.windowStart+90000},{id:randomUUID(),until:saved.windowStart+90000}]});
 await assert.rejects(()=>callWater(),reason('concurrency_limited'));now=saved.windowStart+90001;await callWater();assert.equal((await garden()).xp,2);
});
test('unauthenticated flood is rejected before admission or Firestore rate writes',async()=>{
 await enable();for(let i=0;i<20;i++)await assert.rejects(()=>callWater({requestId:randomUUID()},null),e=>e.code==='unauthenticated');
 assert.equal((await db.collection('garden_rate_limits').get()).size,0);
});
test('paused events retain authorized proof; resume/recovery keeps epochs and identity',async()=>{
 await enable();await toggle('assessment',false);const change=await submitted(await start());await assert.rejects(()=>trigger(change),reason('paused'));
 const proof=await read(`garden_reward_submissions/${operationId(change.after.id)}`);assert.ok(proof);await assert.rejects(()=>recover(change.after.id),reason('paused'));
 const epoch=await db.doc('garden_reward_control/assessment_v1').get();await toggle('assessment',true);assert.equal((await recover(change.after.id)).status,'applied');
 assert.equal((await recover(change.after.id)).status,'already_applied');assert.deepEqual(await read(`garden_reward_submissions/${operationId(change.after.id)}`),proof);
 assert.ok(epoch.createTime.isEqual((await db.doc('garden_reward_control/assessment_v1').get()).updateTime));
});
test('watering and recovery pause independently without erasing receipts',async()=>{
 await enable();await existing();const id=randomUUID();await callWater({requestId:id});const saved=await read(`garden_reward_receipts/${wateringOperationId(uid,id)}`);
 await toggle('watering',false);await assert.rejects(()=>callWater({requestId:id}),reason('paused'));await toggle('watering',true);
 assert.equal((await callWater({requestId:id})).status,'replayed');assert.deepEqual(await read(`garden_reward_receipts/${wateringOperationId(uid,id)}`),saved);
 const change=await submitted(await start());await capture(change);await toggle('recovery',false);await assert.rejects(()=>recover(change.after.id),reason('paused'));
});
test('pause between admission and mutation is rechecked and prevents all Garden effects',async()=>{
 await enable();await existing();await runtime.withAdmission(db,'watering',uid,async()=>{
  await toggle('watering',false);await assert.rejects(()=>water.water(uid,{requestId:randomUUID()}),reason('paused'));
 });assert.equal((await garden()).xp,0);assert.equal((await db.collection('garden_reward_receipts').get()).size,0);
});
test('pause after transaction reads serializes after an atomic in-flight commit',async()=>{
 await enable();await existing();let staged,release;const entered=new Promise(r=>staged=r),hold=new Promise(r=>release=r);
 const wrapped=new Proxy(db,{get(target,key){if(key==='runTransaction')return callback=>target.runTransaction(async tx=>{let wrote=false;const monitored=new Proxy(tx,{get(t,k){const v=Reflect.get(t,k,t);if(k==='update')return(ref,...args)=>{if(ref.path===`student_gardens/${uid}`)wrote=true;return v.call(t,ref,...args);};return typeof v==='function'?v.bind(t):v;}});const result=await callback(monitored);if(wrote){staged();await hold;}return result;});const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 const processor=new GardenWateringProcessor(wrapped,()=>new Date(now),runtime),id=randomUUID();const inflight=processor.water(uid,{requestId:id});await entered;
 let paused=false;const pausing=toggle('watering',false).then(()=>paused=true);await new Promise(r=>setTimeout(r,100));assert.equal(paused,false);
 release();assert.equal((await inflight).status,'rewarded');await pausing;assert.equal((await garden()).xp,2);
 await assert.rejects(()=>water.water(uid,{requestId:randomUUID()}),reason('paused'));assert.ok(await read(`garden_reward_receipts/${wateringOperationId(uid,id)}`));
});
test('concurrent assessment commit and pause serialize without partial Garden/receipt state',async()=>{
 await enable();await existing();const change=await submitted(await start());await capture(change);
 let entered,release;const reached=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 const wrapped=new Proxy(db,{get(target,key){if(key==='runTransaction')return callback=>target.runTransaction(async tx=>{let wrote=false;const monitored=new Proxy(tx,{get(t,k){const value=Reflect.get(t,k,t);if(k==='update')return(ref,...args)=>{if(ref.path===`student_gardens/${uid}`)wrote=true;return value.call(t,ref,...args);};return typeof value==='function'?value.bind(t):value;}});const result=await callback(monitored);if(wrote){entered();await hold;}return result;});const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 const processor=new AssessmentRewardProcessor(wrapped,runtime),inflight=processor.applyReward(change.after.id,uid);await reached;
 let paused=false;const pause=toggle('assessment',false).then(()=>paused=true);await new Promise(r=>setTimeout(r,100));assert.equal(paused,false);
 release();assert.equal((await inflight).status,'applied');await pause;
 assert.deepEqual([(await garden()).xp,(await garden()).seeds],[10,5]);assert.ok(await read(`garden_reward_receipts/${operationId(change.after.id)}`));
 await assert.rejects(()=>processor.applyReward(change.after.id,uid),reason('paused'));
});
test('failed reward transaction creates no false receipt and same operation can recover',async()=>{
 await enable();await existing();const change=await submitted(await start());await capture(change);
 const broken=new Proxy(db,{get(target,key){if(key==='runTransaction')return callback=>target.runTransaction(async tx=>{await callback(tx);throw Error('synthetic commit failure');});const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(()=>new AssessmentRewardProcessor(broken,runtime).applyReward(change.after.id,uid),/synthetic commit failure/);
 assert.equal((await garden()).xp,0);assert.equal(await read(`garden_reward_receipts/${operationId(change.after.id)}`),undefined);
 assert.equal((await recover(change.after.id)).status,'applied');assert.equal((await recover(change.after.id)).status,'already_applied');
});
test('enrollment removal between admission and domain transaction blocks reward mutation',async()=>{
 await enable();const change=await submitted(await start());await capture(change);
 await runtime.withAdmission(db,'recovery',uid,async()=>{await enroll(uid,false);await assert.rejects(()=>rewards.applyReward(change.after.id,uid),reason('not_allowlisted'));});assert.equal(await garden(),undefined);
});
test('operator revision conflicts and unsupported identities fail closed',async()=>{
 await enable();await assert.rejects(()=>operator.configure(true,expiry,1),reason('invalid_safety_configuration'));
 await assert.rejects(()=>operator.enroll(uid,true,expiry,0),reason('invalid_safety_configuration'));
 await assert.rejects(()=>operator.enroll('staff',true,expiry,0),e=>e.code==='permission-denied');
 await assert.rejects(()=>operator.initialize(expiry),reason('invalid_safety_configuration'));
});
test('warning log guard bounds per-instance noise but never samples admin or completed outcomes',()=>{
 let instant=0;const logs=[],sink=boundedAuditSink(event=>logs.push(event),()=>instant);
 for(let i=0;i<50;i++)gardenAudit('unauthenticated',{},sink);assert.equal(logs.length,20);
 for(let i=0;i<30;i++)gardenAudit('operator_switch',{enabled:false,revision:i+1},sink);assert.equal(logs.length,50);
 instant=60000;gardenAudit('unauthenticated',{},sink);assert.equal(logs.at(-1).previousWindowSuppressed,30);
 gardenAudit('watering_completed',{},sink);assert.equal(logs.at(-1).event,'watering_completed');
});
test('audit records omit sensitive content and distinguish completion/replay/operator decisions',async()=>{
 await enable();const change=await submitted(await start());await trigger(change);await trigger(change);await existing().catch(()=>{});await callWater();await callWater({requestId:'wrong',event:'operator_rollout',answers:'SYNTHETIC PRIVATE ANSWER'}).catch(()=>{});
 const text=JSON.stringify(events);assert.ok(!text.includes('SYNTHETIC PRIVATE ANSWER'));assert.ok(!text.includes(uid));assert.ok(!text.includes('token'));
 for(const event of ['operator_rollout','operator_allowlist','operator_switch','submission_captured','assessment_completed','duplicate_detected','watering_completed','processing_failed'])assert.ok(events.some(value=>value.event===event),event);
 const records=[];gardenAudit('processing_failed',{studentId:uid,reason:'private@example.invalid',operationId:'private'},value=>records.push(value));assert.equal(records[0].reason,undefined);assert.equal(records[0].operationId,undefined);
});
for(const owner of [uid,other,'staff','admin',null])test(`client private-collection and cross-owner denials: ${owner??'anonymous'}`,async()=>{
 await enable();await existing();const a=clientApp.initializeApp({projectId:project,apiKey:'synthetic'},`safety-client-${owner}`),d=client.initializeFirestore(a,{localCache:client.memoryLocalCache()});
 client.connectFirestoreEmulator(d,'127.0.0.1',port,owner?{mockUserToken:{sub:owner,user_id:owner}}:undefined);client.setLogLevel('silent');clients.push({app:a,db:d});
 for(const p of [ROLLOUT_PATH,allowlistPath(uid),ratePath(uid,'watering'),'garden_reward_control/assessment_v1','garden_reward_switches/watering_v1','garden_reward_submissions/private','garden_reward_receipts/private']){
  const ref=client.doc(d,p),denied=e=>e.code==='permission-denied';await assert.rejects(()=>client.getDoc(ref),denied);await assert.rejects(()=>client.setDoc(ref,{enabled:true}),denied);await assert.rejects(()=>client.updateDoc(ref,{enabled:true}),denied);await assert.rejects(()=>client.deleteDoc(ref),denied);
 }
 const denied=e=>e.code==='permission-denied';await assert.rejects(()=>client.updateDoc(client.doc(d,'student_gardens',uid),{xp:999,seeds:999,level:9}),denied);
 if(owner!==uid)await assert.rejects(()=>client.getDoc(client.doc(d,'student_gardens',uid)),denied);
});
