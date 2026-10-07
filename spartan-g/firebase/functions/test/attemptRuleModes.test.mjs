/**
 * Legacy attempt chains against the assessment_attempts create rule.
 *
 * Run twice (see package.json):  RULE_MODE=strict  against firebase/firestore.rules (deployed behaviour),
 *                                RULE_MODE=tolerant against the proposed rule (previous attempt only has
 *                                to be finished when it exists).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const MODE = process.env.RULE_MODE === 'tolerant' ? 'tolerant' : 'strict';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Tests require the Firestore emulator; never run against live data.');
initializeApp({ projectId: 'demo-spartan-booking' });
const db = getFirestore();

const repoRequire = createRequire(new URL('../../../package.json', import.meta.url));
const { transformSync } = repoRequire('esbuild');
const source = readFileSync(fileURLToPath(new URL('../../../packages/shared-types/src/utils/attempt-chain.ts', import.meta.url)), 'utf8');
const { planNextAttempt } = await import(`data:text/javascript;base64,${Buffer.from(transformSync(source, { loader: 'ts', format: 'esm' }).code).toString('base64')}`);

let sequence = 0;
async function setup({ maxAttempts = 10 } = {}) {
  const id = `rm_${Date.now()}_${++sequence}`;
  const ids = { a: `${id}_a`, student: `${id}_s` };
  await Promise.all([
    db.doc(`users/${ids.student}`).set({ role: 'student', isActive: true }),
    db.doc(`assessments/${ids.a}`).set({ courseId: 'c1', title: 'PHQ', maxAttempts }),
  ]);
  return ids;
}
const seed = (ids, n, status) => db.doc(`assessment_attempts/${ids.a}_${ids.student}_${n}`)
  .set({ assessmentId: ids.a, studentId: ids.student, status, attemptNumber: n, answers: [], startedAt: Timestamp.now() });
const seedLegacy = (ids, docId, n, status = 'submitted') => db.doc(`assessment_attempts/${docId}`)
  .set({ assessmentId: ids.a, studentId: ids.student, status, attemptNumber: n, answers: [] });
const setOverride = (ids, value) => db.doc(`assessment_overrides/${ids.a}_${ids.student}`)
  .set({ assessmentId: ids.a, studentId: ids.student, maxAttemptsOverride: value, grantedBy: 'admin', grantedAt: Timestamp.now(), reason: 'test' });

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
  sub: uid, user_id: uid, aud: 'demo-spartan-booking', iss: 'https://securetoken.google.com/demo-spartan-booking',
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  firebase: { sign_in_provider: 'custom', identities: {} },
})}.`;
const base = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-spartan-booking/databases/(default)/documents`;
const str = value => ({ stringValue: value });
const int = value => ({ integerValue: String(value) });
/** The exact document startAttempt writes. */
const createAttempt = (ids, n) => fetch(`${base}/assessment_attempts/${ids.a}_${ids.student}_${n}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(ids.student)}` },
  body: JSON.stringify({ fields: {
    assessmentId: str(ids.a), studentId: str(ids.student), campus: str('lipa'), answers: { arrayValue: {} }, status: str('in_progress'),
    startedAt: { timestampValue: new Date().toISOString() }, attemptNumber: int(n),
    createdAt: { timestampValue: new Date().toISOString() }, updatedAt: { timestampValue: new Date().toISOString() },
  } }),
}).then(r => r.status);

const attemptsOf = async ids => (await db.collection('assessment_attempts').where('assessmentId', '==', ids.a).where('studentId', '==', ids.student).get())
  .docs.map(d => ({ id: d.id, ...d.data() }));
/** What the client now does: plan from the real attempt list, then write only if the plan says go. */
async function clientStart(ids, limit) {
  const plan = planNextAttempt(ids.a, ids.student, await attemptsOf(ids), limit, { predecessor: MODE });
  if (!plan.ok) return { plan, status: null };
  return { plan, status: await createAttempt(ids, plan.attemptNumber) };
}

test(`[${MODE}] a clean chain: the client's next attempt is accepted`, async () => {
  const ids = await setup({ maxAttempts: 4 });
  for (let n = 1; n <= 3; n += 1) await seed(ids, n, 'submitted');
  const { plan, status } = await clientStart(ids, 4);
  assert.equal(plan.attemptNumber, 4);
  assert.equal(status, 200);
});

test(`[${MODE}] legacy attempt under a random id (chain 1-3 plus an old attempt numbered 4)`, async () => {
  const ids = await setup();
  for (let n = 1; n <= 3; n += 1) await seed(ids, n, 'submitted');
  await seedLegacy(ids, 'legacy-random-id', 4);
  const { plan, status } = await clientStart(ids, 10);
  if (MODE === 'strict') {
    assert.equal(plan.ok, false, 'client reports a broken chain instead of attempting a doomed write');
    assert.equal(plan.reason, 'broken_chain');
    assert.equal(await createAttempt(ids, 5), 403, 'and the deployed rule would indeed refuse attempt 5');
  } else {
    assert.equal(plan.attemptNumber, 5, 'highest + 1, not count + 1 (which would also be 5 here)');
    assert.equal(status, 200, 'the tolerant rule lets the chain continue past the legacy attempt');
  }
});

test(`[${MODE}] a gap in the chain (attempts 1, 2, 3 and 5): count + 1 would collide, highest + 1 does not`, async () => {
  const ids = await setup();
  for (const n of [1, 2, 3, 5]) await seed(ids, n, 'submitted');
  // The old client picked count + 1 = 5, which already exists as a finished attempt: a refused overwrite.
  assert.equal(await createAttempt(ids, 5), 403);
  const { plan, status } = await clientStart(ids, 10);
  // highest + 1 = 6; its predecessor (5) exists and is finished, so both rule modes accept it.
  assert.equal(plan.ok, true);
  assert.equal(plan.attemptNumber, 6);
  assert.equal(status, 200);
});

test(`[${MODE}] the limit still blocks creating attempts beyond it`, async () => {
  const ids = await setup({ maxAttempts: 4 });
  for (let n = 1; n <= 4; n += 1) await seed(ids, n, 'submitted');
  assert.equal((await clientStart(ids, 4)).plan.reason, 'limit');
  assert.equal(await createAttempt(ids, 5), 403, 'direct write of attempt 5 is refused');
  assert.equal(await createAttempt(ids, 9), 403, 'skipping far ahead is refused');
  await setOverride(ids, 6);
  assert.equal(await createAttempt(ids, 5), 200, 'an override of 6 allows attempt 5');
  await seed(ids, 5, 'submitted');
  assert.equal(await createAttempt(ids, 6), 200);
  await seed(ids, 6, 'submitted');
  assert.equal(await createAttempt(ids, 7), 403, 'and attempt 7 is beyond the override');
});

test(`[${MODE}] an unfinished previous attempt always blocks the next one`, async () => {
  const ids = await setup();
  for (let n = 1; n <= 3; n += 1) await seed(ids, n, 'submitted');
  await seed(ids, 4, 'in_progress');
  assert.equal(await createAttempt(ids, 5), 403);
});

test(`[${MODE}] skipping ahead inside the limit: ${MODE === 'tolerant' ? 'allowed (the price of tolerating gaps)' : 'refused'}`, async () => {
  const ids = await setup({ maxAttempts: 10 });
  await seed(ids, 1, 'submitted');
  assert.equal(await createAttempt(ids, 7), MODE === 'tolerant' ? 200 : 403);
});

test(`[${MODE}] known limitation: legacy attempts under other ids do not count toward the rule's cap`, async () => {
  const ids = await setup({ maxAttempts: 4 });
  for (let n = 1; n <= 4; n += 1) await seedLegacy(ids, `legacy-${n}`, n); // four finished legacy attempts, limit 4
  // The client refuses (it counts all finished attempts)...
  assert.equal((await clientStart(ids, 4)).plan.reason, 'limit');
  // ...but a rule cannot count documents, so a hand-crafted write for attempt 1 is not blocked in either mode.
  assert.equal(await createAttempt(ids, 1), 200);
});
