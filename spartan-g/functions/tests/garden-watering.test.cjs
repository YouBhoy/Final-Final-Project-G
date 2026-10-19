const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { initializeApp: initializeClient, deleteApp: deleteClient } = require('firebase/app');
const client = require('firebase/firestore');
const { LOCAL_REWARD_PROJECT: project, REWARD_PATHS } = require('../lib/garden-rewards/contracts');
const { AssessmentRewardProcessor, trustedSnapshot } = require('../lib/garden-rewards/processor');
const { operationId: assessmentKey } = require('../lib/garden-rewards/eligibility');
const { WATERING_PATHS: paths } = require('../lib/garden-watering/contracts');
const { GardenWateringProcessor } = require('../lib/garden-watering/processor');
const { createLocalGardenWateringFunction } = require('../lib/garden-watering/local-functions');
const { wateringOperationId, wateringDayId } = require('../lib/garden-watering/validation');

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:18084');
assert.equal(process.env.GCLOUD_PROJECT, project);
assert.ok(project.startsWith('demo-'));
const origin = 'http://127.0.0.1:18084';
const uid = 'watering-student-a';
const other = 'watering-student-b';
const baseDay = new Date().toISOString().slice(0, 10);
let now;
const clock = () => new Date(now);
const day = (offset = 0) => new Date(Date.parse(`${baseDay}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const app = initializeApp({ projectId: project }, 'garden-watering-tests');
const db = getFirestore(app);
const processor = new GardenWateringProcessor(db, clock);
const callable = createLocalGardenWateringFunction(db, clock);
const clients = [];
client.setLogLevel('silent');
const read = async path => (await db.doc(path).get()).data();
const garden = (owner = uid) => read(`student_gardens/${owner}`);
const receiptPath = (id, owner = uid) => `${paths.receipts}/${wateringOperationId(owner, id)}`;
const dayPath = (date = day(), owner = uid) => `${paths.receipts}/${wateringDayId(owner, date)}`;
const receiptCount = async () => (await db.collection(paths.receipts).get()).size;
function water(id = randomUUID(), owner = uid, extra = {}, handler = callable) {
  return handler.run({ data: { requestId: id, ...extra },
    auth: owner ? { uid: owner, token: { sub: owner } } : undefined });
}
const rejected = (reason, action) => assert.rejects(action, error => error.details?.reason === reason);
async function existingGarden(extra = {}, owner = uid) {
  await db.doc(`student_gardens/${owner}`).create({ studentId: owner, level: 1, xp: 0, seeds: 0,
    streakCount: 4, lastCheckInDate: day(-1), lastWateredDate: '',
    createdAt: Timestamp.fromMillis(1000), updatedAt: Timestamp.fromMillis(1000), ...extra });
}
async function activate(extra = {}) {
  await db.doc(paths.control).create({ enabled: true, policyVersion: 'legacy-v1', legacyClientRewardWritesBlocked: true, ...extra });
}
beforeEach(async () => {
  const reset = await fetch(`${origin}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: 'DELETE' });
  assert.equal(reset.ok, true);
  now = `${baseDay}T23:59:59.900Z`;
  await activate();
  for (const [id, role, isActive] of [[uid, 'student', true], [other, 'student', true],
    ['inactive', 'student', false], ['staff', 'facilitator', true], ['admin', 'super_admin', true]]) {
    await db.doc(`users/${id}`).create({ uid: id, role, isActive });
  }
});
after(async () => {
  for (const context of clients) { await client.terminate(context.db); await deleteClient(context.app); }
  await db.terminate(); await deleteApp(app);
});

test('valid zero-seed watering atomically awards exactly +2 XP and records both receipts', async () => {
  await existingGarden(); const id = randomUUID();
  const result = await water(id);
  assert.equal(result.status, 'rewarded'); assert.equal(result.result.xpAwarded, 2); assert.equal(result.result.seedsAwarded, 0);
  assert.deepEqual([(await garden()).xp, (await garden()).seeds, (await garden()).level], [2, 0, 1]);
  assert.equal((await garden()).lastWateredDate, day());
  assert.equal((await read(receiptPath(id))).status, 'applied');
  assert.equal((await read(dayPath())).operationId, wateringOperationId(uid, id));
  assert.equal(await receiptCount(), 2);
});

test('watering preserves seeds, assessment streak/date, createdAt and unknown legitimate fields', async () => {
  await existingGarden({ seeds: 23, streakCount: 9, achievements: ['legacy'], extra: { untouched: true } });
  const before = await garden(); await water(); const after = await garden();
  for (const field of ['seeds', 'streakCount', 'lastCheckInDate', 'createdAt', 'achievements', 'extra', 'studentId']) {
    assert.deepEqual(after[field], before[field], field);
  }
  assert.ok(after.updatedAt instanceof Timestamp); assert.notDeepEqual(after.updatedAt, before.updatedAt);
});

for (const [name, initial, expected] of [
  ['below threshold', { level: 3, xp: 145 }, [3, 147]],
  ['exact threshold', { level: 1, xp: 48 }, [2, 0]],
  ['threshold remainder', { level: 3, xp: 149 }, [4, 1]],
  ['legacy high XP advances only once', { level: 1, xp: 201 }, [2, 153]],
]) test(`existing single-threshold policy: ${name}`, async () => {
  await existingGarden(initial); await water(); const data = await garden();
  assert.deepEqual([data.level, data.xp], expected);
});

test('a new request on the same UTC day grants no XP and leaves the Garden timestamp unchanged', async () => {
  await existingGarden(); await water(); const before = await garden(); const id = randomUUID();
  const result = await water(id);
  assert.equal(result.status, 'already_watered'); assert.equal(result.result.status, 'already');
  assert.deepEqual(await garden(), before); assert.equal((await read(receiptPath(id))).status, 'already_watered');
  assert.equal(await receiptCount(), 3);
});

test('legacy same-day watering stamp is honored without manufacturing another earned reward', async () => {
  await existingGarden({ lastWateredDate: day(), xp: 14 }); const before = await garden(); const id = randomUUID();
  assert.equal((await water(id)).status, 'already_watered');
  assert.deepEqual(await garden(), before); assert.equal(await read(dayPath()), undefined);
  assert.equal((await read(receiptPath(id))).status, 'already_watered');
});

test('lost-response retry replays the original committed result without any write', async () => {
  await existingGarden(); const id = randomUUID(); const first = await water(id);
  const before = await garden(), receipt = await read(receiptPath(id)), claim = await read(dayPath());
  const retry = await water(id);
  assert.equal(retry.status, 'replayed'); assert.deepEqual(retry.result, first.result);
  assert.deepEqual(await garden(), before); assert.deepEqual(await read(receiptPath(id)), receipt);
  assert.deepEqual(await read(dayPath()), claim); assert.equal(await receiptCount(), 2);
});

test('retrying the same request after UTC midnight never awards a second reward', async () => {
  await existingGarden(); const id = randomUUID(); const original = await water(id); const before = await garden();
  now = `${day(1)}T00:00:00.100Z`;
  const replay = await water(id); assert.equal(replay.status, 'replayed'); assert.deepEqual(replay.result, original.result);
  assert.deepEqual(await garden(), before); assert.equal(await read(dayPath(day(1))), undefined);
});

test('new request on the next UTC day works even when less than 24 hours elapsed', async () => {
  await existingGarden(); const oldId = randomUUID(); const first = await water(oldId);
  now = `${day(1)}T00:00:00.100Z`; const next = await water();
  assert.equal(next.status, 'rewarded'); assert.equal((await garden()).xp, 4);
  const replay = await water(oldId); assert.equal(replay.status, 'replayed'); assert.deepEqual(replay.result, first.result);
  assert.equal(replay.result.garden.xp, 2, 'Original response is distinct from current XP 4');
  assert.equal(await receiptCount(), 4);
});

test('an already-watered request also stays a no-reward result when retried after midnight', async () => {
  await existingGarden(); await water(); const id = randomUUID(); const original = await water(id);
  now = `${day(1)}T00:00:01Z`;
  const retry = await water(id); assert.equal(retry.status, 'replayed'); assert.deepEqual(retry.result, original.result);
  assert.equal(retry.result.status, 'already'); assert.equal((await garden()).xp, 2);
  assert.equal((await water()).status, 'rewarded'); assert.equal((await garden()).xp, 4);
});

test('concurrent duplicate requests create one reward, one request receipt and one day claim', async () => {
  await existingGarden(); const id = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, () => water(id)));
  assert.equal(results.filter(r => r.status === 'rewarded').length, 1);
  assert.equal(results.filter(r => r.status === 'replayed').length, 7);
  assert.equal((await garden()).xp, 2); assert.equal(await receiptCount(), 2);
});

test('concurrent distinct request IDs on one day still produce only one +2 XP effect', async () => {
  await existingGarden(); const results = await Promise.all(Array.from({ length: 8 }, () => water()));
  assert.equal(results.filter(r => r.status === 'rewarded').length, 1);
  assert.equal(results.filter(r => r.status === 'already_watered').length, 7);
  assert.equal((await garden()).xp, 2); assert.equal(await receiptCount(), 9);
});

test('concurrent old retries and new requests after midnight produce only the new day reward', async () => {
  await existingGarden(); const id = randomUUID(); await water(id); now = `${day(1)}T00:00:01Z`;
  const results = await Promise.all([water(id), water(id), water(), water(), water(), water()]);
  assert.equal(results.filter(r => r.status === 'rewarded').length, 1);
  assert.equal(results.filter(r => r.status === 'replayed').length, 2);
  assert.equal((await garden()).xp, 4);
});

test('missing Garden returns not-found without initializing or creating any receipt', async () => {
  const id = randomUUID(); await assert.rejects(() => water(id), error => error.code === 'not-found' && error.details.reason === 'garden_unavailable');
  assert.equal(await garden(), undefined); assert.equal(await receiptCount(), 0);
});

for (const [name, patch] of [
  ['string XP', { xp: 'bad' }], ['negative seeds', { seeds: -1 }], ['fractional level', { level: 1.5 }],
  ['zero level', { level: 0 }], ['negative streak', { streakCount: -1 }],
  ['invalid UTC day', { lastWateredDate: '2026-02-30' }], ['wrong owner', { studentId: other }],
  ['invalid timestamp', { createdAt: 'not-a-timestamp' }], ['unsafe level threshold', { level: Number.MAX_SAFE_INTEGER }],
  ['XP overflow', { xp: Number.MAX_SAFE_INTEGER }],
]) test(`invalid Garden is preserved without reset: ${name}`, async () => {
  await existingGarden(patch); const before = await garden();
  await rejected('invalid_garden', () => water()); assert.deepEqual(await garden(), before); assert.equal(await receiptCount(), 0);
});

test('a missing required Garden field is not filled or reset automatically', async () => {
  await existingGarden(); await db.doc(`student_gardens/${uid}`).update({ lastWateredDate: FieldValue.delete() });
  const before = await garden(); await rejected('invalid_garden', () => water());
  assert.deepEqual(await garden(), before); assert.equal(await receiptCount(), 0);
});

test('a future watering stamp is held for review rather than moved backward', async () => {
  await existingGarden({ lastWateredDate: day(1) }); const before = await garden();
  await rejected('garden_date_ahead_requires_review', () => water());
  assert.deepEqual(await garden(), before); assert.equal(await receiptCount(), 0);
});

test('unauthenticated callable and invalid internal UID are rejected before any operation', async () => {
  await assert.rejects(() => water(randomUUID(), null), error => error.code === 'unauthenticated');
  await assert.rejects(() => processor.water(undefined, { requestId: randomUUID() }), error => error.code === 'unauthenticated');
  assert.equal(await receiptCount(), 0);
});

for (const account of ['inactive', 'staff', 'admin', 'missing-profile']) {
  test(`active student authorization rejects ${account}`, async () => {
    await existingGarden({}, account);
    await assert.rejects(() => water(randomUUID(), account), error => error.code === 'permission-denied' && error.details.reason === 'active_student_required');
    assert.equal((await garden(account)).xp, 0); assert.equal(await receiptCount(), 0);
  });
}
test('profile UID inconsistency is rejected even when role and active flag match', async () => {
  await existingGarden(); await db.doc(`users/${uid}`).update({ uid: other });
  await rejected('active_student_required', () => water()); assert.equal((await garden()).xp, 0);
});
test('legacy user profiles without a stored UID still use the authenticated document key', async () => {
  await existingGarden(); await db.doc(`users/${uid}`).update({ uid: FieldValue.delete() });
  assert.equal((await water()).status, 'rewarded');
});
test('deactivated accounts cannot replay a completed request', async () => {
  await existingGarden(); const id = randomUUID(); await water(id); const before = await garden();
  await db.doc(`users/${uid}`).update({ isActive: false });
  await rejected('active_student_required', () => water(id)); assert.deepEqual(await garden(), before);
});

for (const [name, input] of [
  ['null', null], ['array', []], ['missing ID', {}], ['short ID', { requestId: 'short' }],
  ['numeric ID', { requestId: 7 }], ['path ID', { requestId: 'other/user' }],
  ['non-v4 UUID', { requestId: '11111111-1111-1111-8111-111111111111' }],
  ['uppercase UUID', { requestId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' }],
  ['padded UUID', { requestId: ' ' + randomUUID() }],
  ...['studentId', 'uid', 'xp', 'seeds', 'level', 'date', 'requestedAt', 'lastWateredDate'].map(field => [field + ' injection', { requestId: randomUUID(), [field]: 'client-value' }]),
]) test(`callable rejects malformed or non-identity input: ${name}`, async () => {
  await existingGarden(); const before = await garden();
  await assert.rejects(() => callable.run({ data: input, auth: { uid, token: { sub: uid } } }),
    error => error.code === 'invalid-argument' && error.details.reason === 'invalid_request_id');
  assert.deepEqual(await garden(), before); assert.equal(await receiptCount(), 0);
});

test('cross-student selection is impossible; the same opaque ID is scoped separately to each owner', async () => {
  await existingGarden(); await existingGarden({}, other); const id = randomUUID();
  await assert.rejects(() => water(id, other, { studentId: uid }), error => error.code === 'invalid-argument');
  assert.equal((await garden()).xp, 0); assert.equal((await garden(other)).xp, 0);
  await water(id); const first = await garden(); await water(id, other);
  assert.deepEqual(await garden(), first); assert.equal((await garden(other)).xp, 2);
  assert.notEqual(receiptPath(id), receiptPath(id, other));
});

function wrappedDatabase(run) {
  return new Proxy(db, { get(target, prop) {
    if (prop === 'runTransaction') return run;
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
test('failed transaction after all writes are staged commits neither Garden nor either receipt', async () => {
  await existingGarden(); const before = await garden(); const id = randomUUID();
  const broken = wrappedDatabase(work => db.runTransaction(async transaction => {
    await work(transaction); throw new Error('synthetic-private-infrastructure-detail');
  }));
  const handler = createLocalGardenWateringFunction(broken, clock);
  await assert.rejects(() => water(id, uid, {}, handler), error => error.code === 'unavailable'
    && error.details.retryable === true && !error.message.includes('private'));
  assert.deepEqual(await garden(), before); assert.equal(await receiptCount(), 0);
  assert.equal((await water(id)).status, 'rewarded'); assert.equal((await garden()).xp, 2);
});

test('failure after staging an already-watered receipt does not consume the request', async () => {
  await existingGarden({ lastWateredDate: day() }); const before = await garden(); const id = randomUUID();
  const broken = wrappedDatabase(work => db.runTransaction(async transaction => { await work(transaction); throw new Error('synthetic abort'); }));
  await assert.rejects(() => water(id, uid, {}, createLocalGardenWateringFunction(broken, clock)), error => error.code === 'unavailable');
  assert.deepEqual(await garden(), before); assert.equal(await receiptCount(), 0);
  assert.equal((await water(id)).status, 'already_watered');
});

test('Firestore automatic ABORTED retry across midnight pins the original trusted request day', async () => {
  await existingGarden(); const id = randomUUID(); let attempts = 0, clockReads = 0;
  const retrying = wrappedDatabase(work => db.runTransaction(async transaction => {
    const result = await work(transaction);
    if (++attempts === 1) { now = `${day(1)}T00:00:01Z`; const aborted = new Error('synthetic ABORTED'); aborted.code = 10; throw aborted; }
    return result;
  }));
  const handler = createLocalGardenWateringFunction(retrying, () => { clockReads++; return clock(); });
  const result = await water(id, uid, {}, handler);
  assert.equal(result.status, 'rewarded'); assert.ok(attempts >= 2); assert.equal(clockReads, 1);
  assert.equal(result.result.day, day()); assert.equal((await garden()).lastWateredDate, day());
  assert.equal((await garden()).xp, 2); assert.equal(await receiptCount(), 2);
  assert.equal((await water(id)).status, 'replayed'); assert.equal((await garden()).xp, 2);
});

for (const [name, patch] of [
  ['pending status', { status: 'pending' }], ['wrong reward day', { rewardDay: '2020-01-01' }],
  ['wrong kind', { 'identity.kind': 'assessment_reward' }], ['wrong owner', { 'identity.studentId': other }],
  ['wrong amount', { 'result.xpAwarded': 999 }], ['wrong result balance', { 'result.garden.xp': 999 }],
  ['wrong seed result', { 'result.garden.seeds': 10 }],
]) test(`conflicting saved receipt is rejected without replacement: ${name}`, async () => {
  await existingGarden(); const id = randomUUID(); await water(id); const before = await garden();
  await db.doc(receiptPath(id)).update(patch); const receipt = await read(receiptPath(id));
  await rejected('receipt_conflict', () => water(id)); assert.deepEqual(await garden(), before);
  assert.deepEqual(await read(receiptPath(id)), receipt);
});

test('a missing day claim cannot turn an existing applied receipt into a fresh reward', async () => {
  await existingGarden(); const id = randomUUID(); await water(id); const before = await garden();
  await db.doc(dayPath()).delete(); await rejected('receipt_conflict', () => water(id)); assert.deepEqual(await garden(), before);
});
test('the durable day guard prevents a new award if the Garden daily stamp was cleared externally', async () => {
  await existingGarden(); await water(); await db.doc(`student_gardens/${uid}`).update({ lastWateredDate: '' });
  const before = await garden(); const id = randomUUID(); await rejected('watering_history_conflict', () => water(id));
  assert.deepEqual(await garden(), before); assert.equal(await read(receiptPath(id)), undefined);
});
test('a corrupt day guard fails closed without changing the Garden', async () => {
  await existingGarden(); await water(); const before = await garden();
  await db.doc(dayPath()).update({ studentId: other }); await rejected('receipt_conflict', () => water());
  assert.deepEqual(await garden(), before);
});

test('watering control must be explicitly enabled and immutable, with legacy client writes blocked', async () => {
  await existingGarden(); await db.doc(paths.control).delete();
  await rejected('watering_not_enabled', () => water());
  await activate({ legacyClientRewardWritesBlocked: false }); await rejected('invalid_watering_control', () => water());
  await db.doc(paths.control).delete(); await activate(); await db.doc(paths.control).update({ enabled: false });
  await rejected('watering_not_enabled', () => water());
  await db.doc(paths.control).update({ enabled: true }); await rejected('invalid_watering_control', () => water());
  assert.equal(await receiptCount(), 0); assert.equal((await garden()).xp, 0);
});
test('recreating the activation gate cannot reset the same request identity', async () => {
  await existingGarden(); const id = randomUUID(); await water(id); const before = await garden();
  await db.doc(paths.control).delete(); await activate(); await rejected('receipt_conflict', () => water(id));
  assert.deepEqual(await garden(), before);
});
test('invalid trusted clock fails closed with a retryable non-sensitive error', async () => {
  await existingGarden(); const handler = createLocalGardenWateringFunction(db, () => new Date(NaN));
  await assert.rejects(() => water(randomUUID(), uid, {}, handler), error => error.code === 'unavailable'
    && error.details.reason === 'server_clock_unavailable' && error.details.retryable === true);
  assert.equal(await receiptCount(), 0);
});

async function assessment() {
  await db.doc(REWARD_PATHS.control).create({ enabled: true, policyVersion: 'legacy-v1', legacyClientRewardWritesBlocked: true });
  await db.doc('assessments/watering-lesson').create({ courseId: 'course', facilitatorId: 'staff', isPublished: true,
    maxAttempts: 1, questions: [{ id: 'q', type: 'short_answer' }] });
  const id = `watering-lesson_${uid}_1`, ref = db.doc(`assessment_attempts/${id}`);
  await ref.create({ assessmentId: 'watering-lesson', studentId: uid, attemptNumber: 1, status: 'in_progress', answers: [] });
  const before = await ref.get(); await ref.update({ status: 'submitted', answers: [{ questionId: 'q', value: 'synthetic answer' }] });
  const after = await ref.get(); const rewards = new AssessmentRewardProcessor(db);
  await rewards.captureSubmission(trustedSnapshot(before), trustedSnapshot(after));
  return { id, apply: () => rewards.applyReward(id, uid), receipt: () => read(`${REWARD_PATHS.receipts}/${assessmentKey(id)}`) };
}
test('watering and assessment rewards commit concurrently without lost XP, seeds, streaks or receipts', async () => {
  await existingGarden({ xp: 48, seeds: 7, streakCount: 3, lastCheckInDate: day(-1), legacy: 'keep' });
  const reward = await assessment(); const id = randomUUID();
  const results = await Promise.all([reward.apply(), water(id)]);
  assert.equal(results[0].status, 'applied'); assert.equal(results[1].status, 'rewarded');
  const value = await garden(); assert.deepEqual([value.level, value.xp, value.seeds, value.streakCount], [2, 10, 12, 4]);
  assert.equal(value.lastCheckInDate, day()); assert.equal(value.lastWateredDate, day()); assert.equal(value.legacy, 'keep');
  assert.equal((await reward.receipt()).identity.kind, 'assessment_reward');
  assert.equal((await read(receiptPath(id))).identity.kind, 'watering'); assert.equal(await receiptCount(), 3);
  const before = await garden(); assert.equal((await reward.apply()).status, 'already_applied');
  assert.equal((await water(id)).status, 'replayed'); assert.deepEqual(await garden(), before);
});
test('assessment-first progression leaves its receipt unchanged after watering', async () => {
  await existingGarden(); const reward = await assessment(); await reward.apply(); const receipt = await reward.receipt();
  await water(); assert.equal((await garden()).xp, 12); assert.equal((await garden()).seeds, 5);
  assert.deepEqual(await reward.receipt(), receipt);
});
test('watering-first progression is preserved when an assessment reward follows', async () => {
  await existingGarden(); const id = randomUUID(); await water(id); const receipt = await read(receiptPath(id));
  const reward = await assessment(); await reward.apply(); assert.equal((await garden()).xp, 12);
  assert.equal((await garden()).seeds, 5); assert.equal((await garden()).lastWateredDate, day());
  assert.deepEqual(await read(receiptPath(id)), receipt);
});

test('local fence rejects production projects and missing/non-loopback emulator settings before reads', async () => {
  const forbidden = { projectId: 'spartan-g-a2d80', runTransaction() { throw new Error('Must not read'); } };
  assert.throws(() => new GardenWateringProcessor(forbidden), /restricted/);
  const prior = process.env.FIRESTORE_EMULATOR_HOST;
  try {
    for (const host of ['', 'example.invalid:18084']) {
      process.env.FIRESTORE_EMULATOR_HOST = host;
      assert.throws(() => createLocalGardenWateringFunction(db), /restricted/);
      await assert.rejects(() => processor.water(uid, { requestId: randomUUID() }), /restricted/);
    }
  } finally { process.env.FIRESTORE_EMULATOR_HOST = prior; }
});

test('clients including active super-admin cannot read/create/update/delete watering control or authoritative history', async () => {
  await existingGarden(); const id = randomUUID(); await water(id);
  let checks = 0;
  for (const owner of [uid, other, 'staff', 'admin', null]) {
    const app = initializeClient({ projectId: project, apiKey: 'synthetic-emulator-only' }, `watering-denials-${owner}`);
    const database = client.getFirestore(app);
    client.connectFirestoreEmulator(database, '127.0.0.1', 18084, owner ? { mockUserToken: { sub: owner, user_id: owner } } : undefined);
    clients.push({ app, db: database });
    for (const target of [paths.control, receiptPath(id), dayPath()]) {
      const ref = client.doc(database, target);
      for (const operation of [() => client.getDocFromServer(ref), () => client.setDoc(ref, { forged: true }),
        () => client.updateDoc(ref, { forged: true }), () => client.deleteDoc(ref)]) {
        await assert.rejects(operation, error => error.code === 'permission-denied'); checks++;
      }
    }
  }
  assert.equal(checks, 60);
});
