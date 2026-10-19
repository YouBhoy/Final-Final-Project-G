// Actual Auth -> callable HTTP -> Firestore tests. Synthetic loopback services only.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase/app');
const authSdk = require('firebase/auth');
const store = require('firebase/firestore');
const functionsSdk = require('firebase/functions');
const project = 'demo-spartan-g-garden-phase2';
const fixture = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'spartan-g-garden-mobile-phase4/private-credentials.json'), 'utf8'));
assert.equal(fixture.projectId, project);
const clients = [];
let student, other, token, winningId, attemptId;
async function client(name) {
  const account = fixture.accounts.find(value => value.fixture === name);
  assert.ok(account);
  const app = initializeApp({ apiKey: 'synthetic-local-emulator-only', projectId: project }, `platform-${name}`);
  const auth = authSdk.getAuth(app);
  authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true });
  const db = store.initializeFirestore(app, { localCache: store.memoryLocalCache() });
  store.connectFirestoreEmulator(db, '127.0.0.1', 18089);
  const functions = functionsSdk.getFunctions(app, 'us-central1');
  functionsSdk.connectFunctionsEmulator(functions, '127.0.0.1', 15001);
  const user = (await authSdk.signInWithEmailAndPassword(auth, account.email, account.password)).user;
  const value = { app, auth, db, functions, uid: user.uid, user };
  clients.push(value);
  return value;
}
const invoke = (client, name, data) => functionsSdk.httpsCallable(client.functions, name, { timeout: 20000 })(data).then(r => r.data);
const garden = client => store.doc(client.db, 'student_gardens', client.uid);
test('dedicated Functions health route is read-only, project-bound and rejects POST', async () => {
  const url = `http://127.0.0.1:15001/${project}/us-central1/gardenLocalHealth`;
  const reply = await fetch(url, { signal: AbortSignal.timeout(20000) }).then(r => r.json());
  assert.deepEqual(reply, { ready: true, projectId: project, region: 'us-central1' });
  assert.equal((await fetch(url, { method: 'POST', signal: AbortSignal.timeout(20000) })).status, 405);
});
before(async () => {
  store.setLogLevel('silent');
  student = await client('automated'); other = await client('other');
  token = await student.user.getIdToken();
}, { timeout: 30000 });
after(async () => { for (const c of clients) { await store.terminate(c.db); await deleteApp(c.app); } });

test('actual Auth token has the common synthetic project and owner', () => {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  assert.equal(claims.aud, project); assert.equal(claims.sub, student.uid);
});
test('owner can initialize a missing Garden with exact zero-reward defaults', async () => {
  assert.equal((await store.getDoc(garden(student))).exists(), false);
  await store.setDoc(garden(student), { studentId: student.uid, level: 1, xp: 0, seeds: 0, streakCount: 0,
    lastCheckInDate: '', lastWateredDate: '', createdAt: store.serverTimestamp(), updatedAt: store.serverTimestamp() });
  assert.equal((await store.getDoc(garden(student))).data().xp, 0);
});
test('cross-owner Garden get and direct progression updates remain denied', async () => {
  await assert.rejects(() => store.getDoc(store.doc(student.db, 'student_gardens', other.uid)), e => e.code === 'permission-denied');
  await assert.rejects(() => store.updateDoc(garden(student), { xp: 999 }), e => e.code === 'permission-denied');
});
test('HTTP callable rejects absent, malformed, wrong-project and expired tokens', async () => {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
  const modify = patch => token.split('.')[0] + '.' + Buffer.from(JSON.stringify({ ...claims, ...patch })).toString('base64url') + '.';
  for (const credential of [null, 'malformed-token', modify({ aud: 'demo-wrong-project' }), modify({ exp: 1 })]) {
    const response = await fetch(`http://127.0.0.1:15001/${project}/us-central1/waterGarden`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
      body: JSON.stringify({ data: { requestId: crypto.randomUUID() } }), signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 401); assert.equal((await response.json()).error.status, 'UNAUTHENTICATED');
  }
});
test('authenticated callable rejects identity/amount spoofing', async () => {
  await assert.rejects(() => invoke(student, 'waterGarden', { requestId: crypto.randomUUID(), studentId: other.uid, xp: 200 }),
    e => e.code === 'functions/invalid-argument');
});
test('concurrent real callable requests award once and cost no seeds', async () => {
  const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
  let finished = false;
  const pending = Promise.allSettled(ids.map(requestId => invoke(student, 'waterGarden', { requestId })))
    .then(results => { finished = true; return results; });
  const timings = [];
  do {
    const began = Date.now();
    const health = await fetch(`http://127.0.0.1:15001/${project}/us-central1/gardenLocalHealth`, { signal: AbortSignal.timeout(15000) });
    assert.equal(health.status, 200); assert.equal((await health.json()).ready, true);
    timings.push(Date.now() - began);
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (!finished);
  const results = await pending;
  results.forEach(result => assert.equal(result.status, 'fulfilled'));
  const replies = results.map(result => result.value);
  fs.writeFileSync(path.resolve(__dirname, '../../docs/garden-mobile-phase4/platform-health-timing.json'),
    JSON.stringify({ samples: timings.length, maximumMs: Math.max(...timings), allHttp200: true }, null, 2) + '\n');
  assert.equal(replies.filter(r => r.status === 'rewarded').length, 1);
  assert.equal(replies.filter(r => r.status === 'already_watered').length, 4);
  winningId = ids[replies.findIndex(r => r.status === 'rewarded')];
  const state = (await store.getDoc(garden(student))).data();
  assert.deepEqual([state.xp, state.seeds, state.streakCount, state.lastCheckInDate], [2, 0, 0, '']);
});
test('lost-response same-ID retry returns replayed without another reward', async () => {
  assert.equal((await invoke(student, 'waterGarden', { requestId: winningId })).status, 'replayed');
  assert.equal((await store.getDoc(garden(student))).data().xp, 2);
});
test('real Firestore submitted event reaches trigger and recovery confirms one assessment reward', { timeout: 60000 }, async () => {
  attemptId = `local-lesson_${student.uid}_1`;
  const ref = store.doc(student.db, 'assessment_attempts', attemptId);
  await store.setDoc(ref, { assessmentId: 'local-lesson', studentId: student.uid, attemptNumber: 1,
    status: 'in_progress', answers: [], startedAt: store.serverTimestamp() });
  await store.updateDoc(ref, { status: 'submitted', answers: [{ questionId: 'q1', value: 'synthetic response' }],
    submittedAt: store.serverTimestamp() });
  let confirmed;
  for (let i = 0; i < 40; i++) {
    try { confirmed = await invoke(student, 'recoverAssessmentReward', { attemptId }); break; }
    catch (e) {
      if (e.details?.reason !== 'trusted_submission_witness_required') throw e;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  assert.ok(confirmed); assert.ok(['applied', 'already_applied'].includes(confirmed.status));
  const state = (await store.getDoc(garden(student))).data();
  assert.deepEqual([state.xp, state.seeds, state.streakCount], [12, 5, 1]);
});
test('duplicate recovery and cross-student recovery preserve original effect', async () => {
  const reply = await invoke(student, 'recoverAssessmentReward', { attemptId });
  assert.equal(reply.status, 'already_applied');
  await assert.rejects(() => invoke(other, 'recoverAssessmentReward', { attemptId }), e => e.code === 'functions/permission-denied');
  assert.equal((await store.getDoc(garden(student))).data().xp, 12);
});
test('client cannot read or modify trusted receipt/control paths', async () => {
  await assert.rejects(() => store.getDoc(store.doc(student.db, 'garden_reward_control/assessment_v1')), e => e.code === 'permission-denied');
  await assert.rejects(() => store.setDoc(store.doc(student.db, 'garden_reward_receipts/fake'), { status: 'applied' }), e => e.code === 'permission-denied');
});
