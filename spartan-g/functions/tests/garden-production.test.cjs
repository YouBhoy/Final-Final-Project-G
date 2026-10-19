const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { initializeApp: clientApp, deleteApp: deleteClient } = require('firebase/app');
const client = require('firebase/firestore');
const { assertLocalRewardDatabase } = require('../lib/garden-rewards/local-safety');
const { AssessmentRewardProcessor, trustedSnapshot } = require('../lib/garden-rewards/processor');
const { GardenWateringProcessor } = require('../lib/garden-watering/processor');
const { operationId } = require('../lib/garden-rewards/eligibility');
const { wateringOperationId } = require('../lib/garden-watering/validation');
const { createControlledGardenRuntime, initializeGardenSwitch, setGardenSwitch, switchPath } = require('../lib/garden-production/activation');
const { assertProductionGardenDatabase } = require('../lib/garden-production/runtime');
const { createControlledGardenFunctions } = require('../lib/garden-production/functions');
const { controlledTransaction } = require('../lib/garden-production/transaction');
const { GardenGateError } = require('../lib/garden-production/activation');
const project = 'demo-spartan-g-garden-phase2', origin = 'http://127.0.0.1:18085';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:18085'); assert.equal(process.env.GCLOUD_PROJECT, project);
const app = initializeApp({ projectId: project }, 'controlled-garden-tests'), db = getFirestore(app);
const runtime = createControlledGardenRuntime(assertLocalRewardDatabase);
const rewards = new AssessmentRewardProcessor(db, runtime);
let instant;
const water = new GardenWateringProcessor(db, () => new Date(instant), runtime);
const handlers = createControlledGardenFunctions(db, runtime);
const uid = 'student-a', attemptId = `lesson_${uid}_1`, clients = [];
const today = new Date().toISOString().slice(0, 10);
const read = async name => (await db.doc(name).get()).data();
const garden = () => read(`student_gardens/${uid}`);
const receipt = id => read(`garden_reward_receipts/${wateringOperationId(uid,id)}`);
const gateError = reason => e => e.reason === reason;
async function epochs() {
  for (const name of ['assessment', 'watering']) await db.doc(`garden_reward_control/${name}_v1`).create({ enabled: true, policyVersion: 'legacy-v1', legacyClientRewardWritesBlocked: true });
  for (const name of ['assessment', 'watering', 'recovery']) await initializeGardenSwitch(db, runtime, name);
}
async function toggle(name, enabled) { const current = await read(switchPath(name)); return setGardenSwitch(db, runtime, name, enabled, current.revision); }
async function allOn() { for (const name of ['assessment', 'watering', 'recovery']) await toggle(name,true); }
async function existing(extra={}) {
  await db.doc(`student_gardens/${uid}`).create({ studentId:uid, level:1, xp:0, seeds:0, streakCount:0,
    lastCheckInDate:'', lastWateredDate:'', createdAt:Timestamp.fromMillis(1000), updatedAt:Timestamp.fromMillis(1000), ...extra });
}
async function start() { const ref = db.doc(`assessment_attempts/${attemptId}`); await ref.create({ assessmentId:'lesson', studentId:uid, attemptNumber:1, status:'in_progress', answers:[] }); return ref.get(); }
async function submit(before) { await before.ref.update({ status:'submitted', answers:[{questionId:'q1',value:'synthetic'}] }); return {before, after:await before.ref.get()}; }
const capture = change => rewards.captureSubmission(trustedSnapshot(change.before), trustedSnapshot(change.after));
const trigger = change => handlers.assessmentSubmitted.run({data:change,params:{attemptId},id:randomUUID(),specversion:'1.0',source:'synthetic-loopback',type:'google.cloud.firestore.document.v1.updated',time:new Date().toISOString()});
const recover = (owner=uid,data={attemptId}) => handlers.recoverAssessmentReward.run({data,auth:owner?{uid:owner,token:{sub:owner}}:undefined});
beforeEach(async()=>{
  assert.ok((await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE'})).ok);
  instant=`${today}T12:00:00.000Z`;
  for(const [id,role,isActive] of [[uid,'student',true],['student-b','student',true],['staff','facilitator',true],['admin','super_admin',true],['inactive','student',false]]) await db.doc(`users/${id}`).create({uid:id,role,isActive});
  await db.doc('assessments/lesson').create({courseId:'course',facilitatorId:'staff',isPublished:true,maxAttempts:3,questions:[{id:'q1',type:'short_answer',text:'Synthetic'}]});
  await epochs();
});
after(async()=>{ for(const c of clients){await client.terminate(c.db);await deleteClient(c.app);}await db.terminate();await deleteApp(app); });

test('operator preparation creates disabled switches without changing immutable epochs or Gardens',async()=>{
  assert.equal(await garden(),undefined);
  for(const name of ['assessment','watering','recovery']) { const value=await read(switchPath(name)); assert.equal(value.enabled,false);assert.equal(value.revision,1); }
  for(const name of ['assessment','watering']) {const s=await db.doc(`garden_reward_control/${name}_v1`).get();assert.ok(s.createTime.isEqual(s.updateTime));}
});
test('missing epoch and missing switch fail closed without automatic creation',async()=>{
  await existing();await db.doc('garden_reward_control/watering_v1').delete();
  await assert.rejects(()=>water.water(uid,{requestId:randomUUID()}),gateError('not_activated'));
  const change=await submit(await start());await db.doc(switchPath('assessment')).delete();
  await assert.rejects(()=>capture(change),gateError('not_activated'));
  assert.equal(await read(`garden_reward_submissions/${operationId(attemptId)}`),undefined);
  assert.equal((await garden()).xp,0);assert.equal((await db.collection('garden_reward_receipts').get()).size,0);
});
test('disabled watering is retryable and produces no Garden effect or false receipt',async()=>{
  await existing();const id=randomUUID();await assert.rejects(()=>water.water(uid,{requestId:id}),e=>e.reason==='paused'&&e.retryable);
  assert.equal((await garden()).xp,0);assert.equal(await receipt(id),undefined);
});
test('enabled watering retains +2 XP, zero seed cost and assessment streak/date',async()=>{
  await existing({streakCount:4,lastCheckInDate:'2000-01-01'});await toggle('watering',true);
  const reply=await water.water(uid,{requestId:randomUUID()});assert.equal(reply.status,'rewarded');
  assert.deepEqual([(await garden()).xp,(await garden()).seeds,(await garden()).streakCount,(await garden()).lastCheckInDate],[2,0,4,'2000-01-01']);
});
test('pause and resume retain original request receipt, epoch and same-day protection',async()=>{
  await existing();await toggle('watering',true);const id=randomUUID();await water.water(uid,{requestId:id});const saved=await receipt(id);
  const epoch=await db.doc('garden_reward_control/watering_v1').get();await toggle('watering',false);
  await assert.rejects(()=>water.water(uid,{requestId:id}),gateError('paused'));await toggle('watering',true);
  assert.equal((await water.water(uid,{requestId:id})).status,'replayed');assert.deepEqual(await receipt(id),saved);
  assert.equal((await water.water(uid,{requestId:randomUUID()})).status,'already_watered');assert.equal((await garden()).xp,2);
  assert.ok(epoch.createTime.isEqual((await db.doc('garden_reward_control/watering_v1').get()).updateTime));
});
test('no-reward receipt stays no-reward across a paused UTC midnight; fresh ID can water next day',async()=>{
  await existing();await toggle('watering',true);await water.water(uid,{requestId:randomUUID()});const id=randomUUID();await water.water(uid,{requestId:id});
  await toggle('watering',false);instant=new Date(Date.parse(instant)+86400000).toISOString();await toggle('watering',true);
  const replay=await water.water(uid,{requestId:id});assert.equal(replay.status,'replayed');assert.equal(replay.result.status,'already');
  assert.equal((await garden()).xp,2);await water.water(uid,{requestId:randomUUID()});assert.equal((await garden()).xp,4);
});
test('concurrent requests after resume still grant exactly one daily reward',async()=>{
  await existing();await toggle('watering',true);await toggle('watering',false);await toggle('watering',true);
  const results=await Promise.all(Array.from({length:8},()=>water.water(uid,{requestId:randomUUID()})));
  assert.equal(results.filter(r=>r.status==='rewarded').length,1);assert.equal((await garden()).xp,2);
});
test('aborted controlled transaction leaves no applied receipt and the same ID can recover',async()=>{
  await existing();await toggle('watering',true);const id=randomUUID();
  const broken=new Proxy(db,{get(target,key){
    if(key==='runTransaction') return callback=>target.runTransaction(async tx=>{await callback(tx);throw Error('synthetic transaction abort');});
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const processor=new GardenWateringProcessor(broken,()=>new Date(instant),runtime);
  await assert.rejects(()=>processor.water(uid,{requestId:id}),/synthetic transaction abort/);
  assert.equal((await garden()).xp,0);assert.equal(await receipt(id),undefined);
  assert.equal((await water.water(uid,{requestId:id})).status,'rewarded');assert.equal((await garden()).xp,2);
});
test('a known error after staging a write still aborts; read-only rejection handling cannot commit it',async()=>{
  await assert.rejects(()=>controlledTransaction(db,async tx=>{tx.create(db.doc('local_test_environment/abort-guard'),{synthetic:true});throw new GardenGateError('paused',true);},e=>e instanceof GardenGateError),gateError('paused'));
  assert.equal(await read('local_test_environment/abort-guard'),undefined);
});
test('paused submission preserves trusted proof, rejects award retryably, and resumes exactly once',async()=>{
  const change=await submit(await start());await assert.rejects(()=>trigger(change),e=>e.reason==='paused'&&e.retryable);
  assert.ok(await read(`garden_reward_submissions/${operationId(attemptId)}`));assert.equal(await garden(),undefined);
  await allOn();const results=await Promise.all([trigger(change),recover(),recover()]);assert.equal(results.filter(r=>r.status==='applied').length,1);
  assert.deepEqual([(await garden()).xp,(await garden()).seeds,(await garden()).streakCount],[10,5,1]);
});
test('recovery switch is independently required without preventing the enabled trusted trigger',async()=>{
  await toggle('assessment',true);const change=await submit(await start());await capture(change);
  await assert.rejects(()=>recover(),e=>e.code==='unavailable'&&e.details.reason==='paused');
  assert.equal((await trigger(change)).status,'applied');await toggle('recovery',true);
  const saved=await read(`garden_reward_receipts/${operationId(attemptId)}`);assert.equal((await recover()).status,'already_applied');
  await toggle('recovery',false);await assert.rejects(()=>recover(),e=>e.code==='unavailable');await toggle('recovery',true);
  assert.equal((await recover()).status,'already_applied');assert.deepEqual(await read(`garden_reward_receipts/${operationId(attemptId)}`),saved);
});
test('assessment pause also blocks recovery even when the recovery switch is enabled',async()=>{
  await toggle('recovery',true);await capture(await submit(await start()));
  await assert.rejects(()=>recover(),e=>e.code==='unavailable');assert.equal(await garden(),undefined);
});
test('historical attempts remain excluded after switches change',async()=>{
  await db.doc('garden_reward_control/assessment_v1').delete();await db.doc(switchPath('assessment')).delete();await db.doc(switchPath('recovery')).delete();
  const before=await start();await db.doc('garden_reward_control/assessment_v1').create({enabled:true,policyVersion:'legacy-v1',legacyClientRewardWritesBlocked:true});
  await initializeGardenSwitch(db,runtime,'assessment');await initializeGardenSwitch(db,runtime,'recovery');await toggle('assessment',true);await toggle('recovery',true);
  const reply=await trigger(await submit(before));assert.equal(reply.reason,'historical_attempt');await assert.rejects(()=>recover(),e=>e.details.reason==='historical_attempt');assert.equal(await garden(),undefined);
});
test('receipt absence never authorizes recovery without a trusted witness',async()=>{
  await allOn();await submit(await start());await assert.rejects(()=>recover(),e=>e.details.reason==='trusted_submission_witness_required');assert.equal(await garden(),undefined);
});
test('switch edits do not relax ownership, authentication or payload checks',async()=>{
  await allOn();await capture(await submit(await start()));
  await assert.rejects(()=>recover(null),e=>e.code==='unauthenticated');await assert.rejects(()=>recover('student-b'),e=>e.code==='permission-denied');
  await assert.rejects(()=>recover(uid,{attemptId,xp:999}),e=>e.code==='invalid-argument');
  await existing();await assert.rejects(()=>water.water('staff',{requestId:randomUUID()}),e=>e.reason==='active_student_required');
});
test('stale/concurrent operator revisions cannot overwrite a newer switch decision',async()=>{
  const results=await Promise.allSettled([setGardenSwitch(db,runtime,'watering',true,1),setGardenSwitch(db,runtime,'watering',false,1)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.reason==='switch_conflict').length,1);
  assert.equal((await read(switchPath('watering'))).revision,2);await assert.rejects(()=>initializeGardenSwitch(db,runtime,'watering'),gateError('switch_conflict'));
});
test('modified epoch is rejected rather than resetting balances or receipt history',async()=>{
  await existing();await toggle('watering',true);const id=randomUUID();await water.water(uid,{requestId:id});const saved=await receipt(id);
  // Firestore may optimize an identical-value update without changing updateTime.
  await db.doc('garden_reward_control/watering_v1').update({auditMutation:'synthetic-test'});await assert.rejects(()=>water.water(uid,{requestId:randomUUID()}),gateError('invalid_activation'));
  assert.deepEqual(await receipt(id),saved);assert.equal((await garden()).xp,2);
});
test('wrong epoch binding or malformed switch fails closed',async()=>{
  await existing();await toggle('watering',true);await db.doc(switchPath('watering')).update({epochCreateTime:Timestamp.fromMillis(1)});
  await assert.rejects(()=>water.water(uid,{requestId:randomUUID()}),gateError('invalid_activation'));assert.equal((await garden()).xp,0);
});
test('production database guard rejects emulator and wrong targets before any document operation',()=>{
  let reads=0;const fake={projectId:'spartan-g-a2d80',databaseId:'(default)',doc(){reads++;throw Error('Network forbidden');}};
  assert.throws(()=>assertProductionGardenDatabase(fake));assert.throws(()=>assertProductionGardenDatabase({...fake,projectId:project}));assert.equal(reads,0);
  const keys=['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FUNCTIONS_EMULATOR','FIREBASE_DATABASE_EMULATOR_HOST','FIREBASE_DEBUG_FEATURES'];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try {
    keys.forEach(key=>delete process.env[key]);process.env.GCLOUD_PROJECT='spartan-g-a2d80';
    assert.doesNotThrow(()=>assertProductionGardenDatabase(fake));
    assert.throws(()=>assertProductionGardenDatabase({...fake,databaseId:'other'}));assert.equal(reads,0);
  } finally { for(const key of keys) saved[key]===undefined?delete process.env[key]:process.env[key]=saved[key]; }
});
test('production exports are prepared separately; existing notification main is unchanged',()=>{
  const root=path.resolve(__dirname,'../..');const pkg=JSON.parse(fs.readFileSync(path.join(root,'functions/package.json')));
  assert.equal(pkg.main,'lib/index.js');const source=fs.readFileSync(path.join(root,'functions/src/index.ts'),'utf8');assert.ok(!source.includes('production-garden'));
  assert.deepEqual([...source.matchAll(/^export const (\w+)/gm)].map(m=>m[1]),['onMessageCreated','onAppointmentCreated']);
});
for(const owner of [uid,'student-b','staff','admin',null]) test(`untrusted ${owner||'anonymous'} cannot read/create/update/delete switches`,async()=>{
  const app=clientApp({projectId:project,apiKey:'synthetic'},`switch-${owner}`), db=client.initializeFirestore(app,{localCache:client.memoryLocalCache()});
  client.connectFirestoreEmulator(db,'127.0.0.1',18085,owner?{mockUserToken:{sub:owner,user_id:owner}}:undefined);client.setLogLevel('silent');clients.push({app,db});
  const ref=client.doc(db,switchPath('watering')), denied=e=>e.code==='permission-denied';
  await assert.rejects(()=>client.getDoc(ref),denied);await assert.rejects(()=>client.setDoc(client.doc(db,'garden_reward_switches/new'),{enabled:true}),denied);
  await assert.rejects(()=>client.updateDoc(ref,{enabled:true}),denied);await assert.rejects(()=>client.deleteDoc(ref),denied);
});
