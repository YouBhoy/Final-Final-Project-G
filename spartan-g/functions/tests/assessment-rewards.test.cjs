const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Firestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { initializeApp: initializeClient, deleteApp: deleteClient } = require('firebase/app');
const client = require('firebase/firestore');
const { LOCAL_REWARD_PROJECT: project, REWARD_PATHS: paths } = require('../lib/garden-rewards/contracts');
const { AssessmentRewardProcessor, trustedSnapshot } = require('../lib/garden-rewards/processor');
const { createLocalAssessmentRewardFunctions } = require('../lib/garden-rewards/local-functions');
const { operationId } = require('../lib/garden-rewards/eligibility');

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:18082');
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.ok(project.startsWith('demo-'));
const origin = 'http://127.0.0.1:18082';
const uid = 'student-a';
const attemptId = `lesson_${uid}_1`;
const app = initializeApp({ projectId: project }, 'garden-rewards-emulator');
const db = getFirestore(app);
const processor = new AssessmentRewardProcessor(db);
const handlers = createLocalAssessmentRewardFunctions(db);
const answerValues = [{ questionId: 'q1', value: 'yes' }, { questionId: 'q2', value: 'fixture response' }];
const questions = [
  { id: 'q1', type: 'multiple_choice', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] },
  { id: 'q2', type: 'short_answer' },
];
const clients = [];
client.setLogLevel('silent');
const read = async path => (await db.doc(path).get()).data();
const garden = () => read(`student_gardens/${uid}`);
const receiptPath = (id = attemptId) => `${paths.receipts}/${operationId(id)}`;
const witnessPath = (id = attemptId) => `${paths.submissions}/${operationId(id)}`;
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const rejected = (reason, action) => assert.rejects(action, error => error.reason === reason);

async function reset() {
  const response = await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(response.ok, true);
}
async function activate(extra = {}) {
  await db.doc(paths.control).create({ enabled: true, policyVersion: 'legacy-v1',
    legacyClientRewardWritesBlocked: true, ...extra });
}
async function fixtures({ enabled = true } = {}) {
  for (const [id, role] of [[uid, 'student'], ['student-b', 'student'], ['staff', 'facilitator'], ['admin', 'super_admin']]) {
    await db.doc(`users/${id}`).set({ role, isActive: true });
  }
  await db.doc('assessments/lesson').set({ courseId: 'course-1', facilitatorId: 'staff', isPublished: true, maxAttempts: 3, questions });
  if (enabled) await activate();
}
async function start(id = attemptId, extra = {}) {
  await db.doc(`assessment_attempts/${id}`).create({ assessmentId: 'lesson', studentId: uid,
    attemptNumber: 1, status: 'in_progress', answers: [], ...extra });
  return db.doc(`assessment_attempts/${id}`).get();
}
async function submit(before, extra = {}) {
  await before.ref.update({ status: 'submitted', answers: answerValues, submittedAt: Timestamp.fromMillis(1), ...extra });
  return { before, after: await before.ref.get() };
}
async function capture(change) { await processor.captureSubmission(trustedSnapshot(change.before), trustedSnapshot(change.after)); }
function trigger(change, id = 'synthetic-event') {
  return handlers.assessmentSubmitted.run({ data: change, params: { attemptId: change.after.id }, id,
    specversion: '1.0', source: 'synthetic-loopback-only', type: 'google.cloud.firestore.document.v1.updated',
    time: new Date().toISOString(), project, database: '(default)', namespace: '(default)', location: 'local' });
}
function recover(id = attemptId, owner = uid, extra = {}) {
  return handlers.recoverAssessmentReward.run({ data: { attemptId: id, ...extra },
    auth: owner ? { uid: owner, token: { sub: owner } } : undefined });
}
async function existingGarden(extra = {}) {
  await db.doc(`student_gardens/${uid}`).create({ studentId: uid, level: 1, xp: 0, seeds: 0,
    streakCount: 0, lastCheckInDate: '', lastWateredDate: '', createdAt: Timestamp.fromMillis(1000),
    updatedAt: Timestamp.fromMillis(1000), ...extra });
}
beforeEach(async () => { await reset(); await fixtures(); });
after(async () => {
  for (const context of clients) { await client.terminate(context.db); await deleteClient(context.app); }
  await db.terminate(); await deleteApp(app);
});

test('valid completion: submission trigger atomically rewards a missing Garden and writes a receipt', async () => {
  const change = await submit(await start());
  const completedBefore = await read(`assessment_attempts/${attemptId}`);
  const result = await trigger(change);
  assert.equal(result.status, 'applied');
  const record = await garden();
  assert.deepEqual([record.level, record.xp, record.seeds, record.streakCount], [1, 10, 5, 1]);
  assert.equal(record.lastCheckInDate, change.after.updateTime.toDate().toISOString().slice(0, 10));
  assert.equal(record.lastWateredDate, '');
  assert.ok(record.createdAt instanceof Timestamp);
  assert.equal((await read(receiptPath())).status, 'applied');
  assert.deepEqual(await read(`assessment_attempts/${attemptId}`), completedBefore, 'Completed attempt stays untouched');
});

test('recovery requires verified callable authentication and exact identity-only input', async () => {
  await assert.rejects(() => recover(attemptId, null), error => error.code === 'unauthenticated');
  for (const extra of [{ xp: 999 }, { seeds: 999 }, { studentId: 'student-b' }, { submittedAt: new Date().toISOString() }]) {
    await assert.rejects(() => recover(attemptId, uid, extra), error => error.code === 'invalid-argument');
  }
  assert.equal(await garden(), undefined);
});

test('another student cannot recover an otherwise valid owned submission', async () => {
  await capture(await submit(await start()));
  await assert.rejects(() => recover(attemptId, 'student-b'), error => error.code === 'permission-denied' && error.details.reason === 'not_attempt_owner');
  assert.equal(await garden(), undefined);
  assert.equal(await read(receiptPath()), undefined);
});

test('identity changes between event snapshots are rejected', async () => {
  const change = await submit(await start(), { studentId: 'student-b' });
  await assert.rejects(() => capture(change));
  assert.equal(await read(witnessPath()), undefined);
  assert.equal(await garden(), undefined);
});

test('an in-progress attempt is ignored by the trigger and cannot recover a reward', async () => {
  const before = await start(); await before.ref.update({ answers: answerValues });
  assert.deepEqual(await trigger({ before, after: await before.ref.get() }), { status: 'ignored' });
  await assert.rejects(() => recover(), error => error.code === 'failed-precondition');
  assert.equal(await garden(), undefined);
});

for (const [name, answers] of [
  ['missing answer', answerValues.slice(0, 1)], ['empty answer', [{ questionId: 'q1', value: 'yes' }, { questionId: 'q2', value: '' }]],
  ['invalid option', [{ questionId: 'q1', value: 'invented' }, answerValues[1]]],
  ['duplicate answer', [answerValues[0], answerValues[0]]],
  ['unknown question', [answerValues[0], { questionId: 'unknown', value: 'x' }]],
]) {
  test(`incomplete/invalid submitted attempt denied: ${name}`, async () => {
    await rejected('assessment_incomplete', () => captureFromAnswers(answers));
    assert.equal(await read(witnessPath()), undefined);
    assert.equal(await read(receiptPath()), undefined);
    assert.equal(await garden(), undefined);
  });
}
async function captureFromAnswers(answers) { await capture(await submit(await start(), { answers })); }

test('duplicate event delivery and duplicate recovery calls award once', async () => {
  const change = await submit(await start());
  assert.equal((await trigger(change, 'event-1')).status, 'applied');
  assert.equal((await trigger(change, 'event-2')).status, 'already_applied');
  assert.equal((await recover()).status, 'already_applied');
  assert.deepEqual([(await garden()).xp, (await garden()).seeds], [10, 5]);
  assert.equal((await db.collection(paths.receipts).get()).size, 1);
});

test('concurrent duplicate capture creates one witness; concurrent recoveries produce one reward', async () => {
  const change = await submit(await start());
  await Promise.all([capture(change), capture(change), capture(change)]);
  const responses = await Promise.all(Array.from({ length: 8 }, () => recover()));
  assert.equal(responses.filter(x => x.status === 'applied').length, 1);
  assert.equal(responses.filter(x => x.status === 'already_applied').length, 7);
  assert.equal((await db.collection(paths.submissions).get()).size, 1);
  assert.deepEqual([(await garden()).xp, (await garden()).seeds], [10, 5]);
});

test('lost-response retry returns the durable result without further changes', async () => {
  await capture(await submit(await start()));
  await recover(); // Simulate the client never receiving this successful response.
  const previousGarden = await garden(); const previousReceipt = await read(receiptPath());
  const retry = await recover();
  assert.equal(retry.status, 'already_applied');
  assert.deepEqual(retry.result, previousReceipt.result);
  assert.deepEqual(await garden(), previousGarden);
  assert.deepEqual(await read(receiptPath()), previousReceipt);
});

test('existing progression preserves balances except earned delta, legacy fields and original creation time', async () => {
  await existingGarden({ level: 3, xp: 145, seeds: 22, streakCount: 4, lastCheckInDate: day(-1),
    lastWateredDate: day(-1), legacyAchievement: ['keep'] });
  const before = await garden();
  await trigger(await submit(await start()));
  const after = await garden();
  assert.deepEqual([after.level, after.xp, after.seeds, after.streakCount], [4, 5, 27, 5]);
  assert.deepEqual(after.createdAt, before.createdAt);
  assert.deepEqual(after.legacyAchievement, ['keep']);
  assert.equal(after.lastWateredDate, before.lastWateredDate);
});

test('distinct same-day eligible attempts each reward, while the streak increments only once', async () => {
  await trigger(await submit(await start()));
  const id2 = `lesson_${uid}_2`;
  await trigger(await submit(await start(id2, { attemptNumber: 2 })));
  const record = await garden();
  assert.deepEqual([record.xp, record.seeds, record.streakCount], [20, 10, 1]);
  assert.equal((await db.collection(paths.receipts).get()).size, 2);
});

test('concurrent distinct attempts preserve both rewards without lost Garden updates', async () => {
  const first = await submit(await start());
  const secondId = `lesson_${uid}_2`;
  const second = await submit(await start(secondId, { attemptNumber: 2 }));
  await capture(first); await capture(second);
  const responses = await Promise.all([recover(), recover(secondId)]);
  assert.deepEqual(responses.map(response => response.status), ['applied', 'applied']);
  assert.deepEqual([(await garden()).xp, (await garden()).seeds, (await garden()).streakCount], [20, 10, 1]);
});

for (const existing of [false, true]) {
  test(`failed transaction rolls back Garden and applied receipt; recovery succeeds (${existing ? 'existing' : 'missing'} Garden)`, async () => {
    if (existing) await existingGarden({ xp: 17, seeds: 20 });
    await capture(await submit(await start()));
    const before = await garden();
    const failingDb = new Proxy(db, { get(target, prop) {
      if (prop === 'runTransaction') return work => target.runTransaction(async transaction => {
        await work(transaction); // Real reads and staged writes, followed by abort before commit.
        throw new Error('synthetic transaction failure');
      });
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await assert.rejects(() => new AssessmentRewardProcessor(failingDb).applyReward(attemptId, uid), /synthetic transaction failure/);
    assert.deepEqual(await garden(), before);
    assert.equal(await read(receiptPath()), undefined);
    assert.ok(await read(witnessPath()));
    assert.equal((await recover()).status, 'applied');
    assert.equal((await garden()).xp, existing ? 27 : 10);
  });
}

test('historical attempts are excluded even if submitted after activation and have no receipt', async () => {
  await reset(); await fixtures({ enabled: false });
  const before = await start();
  await existingGarden({ xp: 30, seeds: 40 }); const balance = await garden();
  await activate();
  const change = await submit(before);
  await rejected('historical_attempt', () => capture(change));
  await assert.rejects(() => recover(), error => error.details.reason === 'historical_attempt');
  assert.deepEqual(await garden(), balance);
  assert.equal(await read(receiptPath()), undefined);
});

test('missing receipt without a trusted submission witness never proves an unpaid assessment', async () => {
  await submit(await start());
  await assert.rejects(() => recover(), error => error.details.reason === 'trusted_submission_witness_required');
  assert.equal(await read(receiptPath()), undefined);
  assert.equal(await garden(), undefined);
});

test('already completed historical attempts remain excluded from recovery', async () => {
  await reset(); await fixtures({ enabled: false });
  await submit(await start()); await activate();
  await assert.rejects(() => recover(), error => error.details.reason === 'historical_attempt');
  assert.equal(await read(witnessPath()), undefined);
  assert.equal(await garden(), undefined);
});

test('client timestamps are ignored; reward day is bound to Firestore submission commit metadata', async () => {
  const change = await submit(await start(), { submittedAt: Timestamp.fromMillis(0),
    answers: answerValues.map(answer => ({ ...answer, answeredAt: Timestamp.fromMillis(0) })) });
  const result = await trigger(change);
  assert.equal(result.result.day, change.after.updateTime.toDate().toISOString().slice(0, 10));
  assert.notEqual(result.result.day, '1970-01-01');
});

test('definition changes during an attempt fail closed instead of guessing the old definition', async () => {
  const before = await start();
  await db.doc('assessments/lesson').update({ title: 'changed after attempt creation' });
  await rejected('definition_changed_requires_review', async () => capture(await submit(before)));
  assert.equal(await read(witnessPath()), undefined);
  await assert.rejects(() => recover());
  assert.equal(await garden(), undefined);
});

test('a change after witness capture cannot change verified eligibility or reward calculation', async () => {
  await capture(await submit(await start()));
  await db.doc('assessments/lesson').update({ questions: [], maxAttempts: 0, isPublished: false });
  assert.equal((await recover()).status, 'applied');
  assert.deepEqual([(await garden()).xp, (await garden()).seeds], [10, 5]);
});

test('post-capture answer modification cannot bypass eligibility through recovery', async () => {
  await capture(await submit(await start()));
  await db.doc(`assessment_attempts/${attemptId}`).update({ answers: [{ questionId: 'q1', value: 'yes' }] });
  await assert.rejects(() => recover());
  assert.equal(await garden(), undefined);
});

test('grading with unchanged answers permits recovery but does not award a second reward', async () => {
  await capture(await submit(await start()));
  await db.doc(`assessment_attempts/${attemptId}`).update({ status: 'graded', score: 50, feedback: 'synthetic' });
  assert.equal((await recover()).status, 'applied');
  assert.equal((await recover()).status, 'already_applied');
});

for (const [label, patch] of [['inactive', { isActive: false }], ['staff', { role: 'facilitator' }]]) {
  test(`${label} profile cannot receive a new assessment reward`, async () => {
    const change = await submit(await start());
    await db.doc(`users/${uid}`).update(patch);
    await rejected('active_student_required', () => capture(change));
    assert.equal(await read(witnessPath()), undefined);
    assert.equal(await garden(), undefined);
  });
}

test('post-capture deactivation is checked again by recovery', async () => {
  await capture(await submit(await start()));
  await db.doc(`users/${uid}`).update({ isActive: false });
  await assert.rejects(() => recover(), error => error.code === 'permission-denied');
  assert.equal(await garden(), undefined);
});

test('callable infrastructure failures have typed retryable errors without leaking raw details', async () => {
  const failingDb = new Proxy(db, { get(target, prop) {
    if (prop === 'runTransaction') return async () => { throw new Error('synthetic private infrastructure details'); };
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const failing = createLocalAssessmentRewardFunctions(failingDb);
  await assert.rejects(() => failing.recoverAssessmentReward.run({ data: { attemptId }, auth: { uid, token: { sub: uid } } }),
    error => error.code === 'unavailable' && error.details.retryable === true && !error.message.includes('private'));
  assert.equal(await read(receiptPath()), undefined);
});

test('trigger infrastructure failures escape for retry and cannot leave a false applied receipt', async () => {
  const change = await submit(await start());
  const failingDb = new Proxy(db, { get(target, prop) {
    if (prop === 'runTransaction') return async () => { throw new Error('synthetic transient trigger failure'); };
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const failing = createLocalAssessmentRewardFunctions(failingDb);
  const event = { data: change, params: { attemptId } };
  await assert.rejects(() => failing.assessmentSubmitted.run(event), /synthetic transient/);
  assert.equal(await read(receiptPath()), undefined);
  assert.equal((await trigger(change)).status, 'applied');
});

test('deleting/recreating the same attempt ID cannot reset its reward receipt', async () => {
  await trigger(await submit(await start()));
  const previousGarden = await garden();
  await db.doc(`assessment_attempts/${attemptId}`).delete();
  const recreated = await submit(await start());
  await assert.rejects(() => capture(recreated));
  await assert.rejects(() => recover());
  assert.deepEqual(await garden(), previousGarden);
  assert.equal((await db.collection(paths.receipts).get()).size, 1);
});

test('malformed existing Garden is not overwritten or repaired', async () => {
  await existingGarden({ xp: 'malformed' }); const before = await garden();
  await capture(await submit(await start()));
  await assert.rejects(() => recover(), error => error.details.reason === 'malformed_garden_or_receipt');
  assert.deepEqual(await garden(), before);
  assert.equal(await read(receiptPath()), undefined);
});

test('late/out-of-order reward day is held for review without changing the streak formula', async () => {
  await existingGarden({ streakCount: 7, lastCheckInDate: day(1), seeds: 15 }); const before = await garden();
  await capture(await submit(await start()));
  await assert.rejects(() => recover(), error => error.details.reason === 'out_of_order_day_requires_review');
  assert.deepEqual(await garden(), before);
  assert.equal(await read(receiptPath()), undefined);
});

test('malformed/conflicting receipt is never replaced by a fresh reward', async () => {
  await trigger(await submit(await start())); const before = await garden();
  await db.doc(receiptPath()).update({ status: 'pending' });
  await assert.rejects(() => recover(), error => error.details.reason === 'receipt_conflict');
  assert.deepEqual(await garden(), before);
  assert.equal((await read(receiptPath())).status, 'pending');
});

test('gate cannot be absent, backdated, or edited/re-enabled to include historical attempts', async () => {
  const change = await submit(await start());
  await db.doc(paths.control).delete();
  await rejected('rewards_not_activated', () => capture(change));
  await activate({ activatedAt: Timestamp.fromMillis(0) });
  await rejected('invalid_activation_boundary', () => capture(change));
  await db.doc(paths.control).delete(); await activate();
  await db.doc(paths.control).update({ enabled: false });
  await rejected('rewards_not_activated', () => capture(change));
  await db.doc(paths.control).update({ enabled: true });
  await rejected('invalid_activation_boundary', () => capture(change));
  assert.equal(await garden(), undefined);
});

test('attempt cap and prior-attempt conditions are rechecked, not taken from the client', async () => {
  const overLimit = await submit(await start(`lesson_${uid}_4`, { attemptNumber: 4 }));
  await rejected('attempt_limit_exceeded', () => capture(overLimit));
  const noPrior = await submit(await start(`lesson_${uid}_2`, { attemptNumber: 2 }));
  await assert.rejects(() => capture(noPrior));
  assert.equal(await garden(), undefined);
});

test('a valid pre-existing admin override permits its intended additional attempt', async () => {
  await db.doc('assessments/lesson').update({ maxAttempts: 1 });
  await db.doc(`assessment_overrides/lesson_${uid}`).create({ assessmentId: 'lesson', studentId: uid, maxAttemptsOverride: 2 });
  await trigger(await submit(await start()));
  const second = await submit(await start(`lesson_${uid}_2`, { attemptNumber: 2 }));
  assert.equal((await trigger(second)).status, 'applied');
  assert.equal((await garden()).xp, 20);
});

test('production project and missing emulator environment are rejected before any read', async () => {
  const other = new Firestore({ projectId: 'spartan-g-a2d80' });
  try { assert.throws(() => new AssessmentRewardProcessor(other), /restricted/); }
  finally { await other.terminate(); }
  const prior = process.env.FIRESTORE_EMULATOR_HOST;
  try { delete process.env.FIRESTORE_EMULATOR_HOST; assert.throws(() => createLocalAssessmentRewardFunctions(db), /restricted/); }
  finally { process.env.FIRESTORE_EMULATOR_HOST = prior; }
});

test('all new server-only paths deny client reads/writes, including active super-admin clients', async () => {
  await trigger(await submit(await start()));
  for (const id of [uid, 'student-b', 'staff', 'admin', null]) {
    const clientApp = initializeClient({ projectId: project, apiKey: 'synthetic-emulator-only' }, `reward-rules-${id}`);
    const clientDb = client.getFirestore(clientApp);
    client.connectFirestoreEmulator(clientDb, '127.0.0.1', 18082, id ? { mockUserToken: { sub: id, user_id: id } } : undefined);
    clients.push({ app: clientApp, db: clientDb });
    for (const serverPath of [paths.control, witnessPath(), receiptPath()]) {
      const ref = client.doc(clientDb, serverPath);
      for (const operation of [() => client.getDocFromServer(ref), () => client.setDoc(ref, { forged: true }),
        () => client.updateDoc(ref, { forged: true }), () => client.deleteDoc(ref)]) {
        await assert.rejects(operation, error => error.code === 'permission-denied');
      }
    }
  }
});
