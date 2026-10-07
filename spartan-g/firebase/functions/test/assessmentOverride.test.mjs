import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Tests require the Firestore emulator; never run against live data.');
initializeApp({ projectId: 'demo-spartan-booking' });
const db = getFirestore();

let sequence = 0;
async function setup({ maxAttempts = 2 } = {}) {
  const id = `ov_${Date.now()}_${++sequence}`;
  const ids = { a: `${id}_a`, admin: `${id}_admin`, iadmin: `${id}_iadmin`, fac: `${id}_fac`, student: `${id}_s`, other: `${id}_o` };
  await Promise.all([
    db.doc(`users/${ids.admin}`).set({ role: 'super_admin', isActive: true, email: 'a@x.com' }),
    db.doc(`users/${ids.iadmin}`).set({ role: 'super_admin', isActive: false }),
    db.doc(`users/${ids.fac}`).set({ role: 'facilitator', isActive: true }),
    db.doc(`users/${ids.student}`).set({ role: 'student', isActive: true }),
    db.doc(`users/${ids.other}`).set({ role: 'student', isActive: true }),
    db.doc(`assessments/${ids.a}`).set({ courseId: 'c1', title: 'PHQ', maxAttempts }),
  ]);
  return ids;
}
const attemptDoc = (ids, uid, n, status) => db.doc(`assessment_attempts/${ids.a}_${uid}_${n}`)
  .set({ assessmentId: ids.a, studentId: uid, status, attemptNumber: n, answers: [], startedAt: Timestamp.now() });
const overrideRef = ids => db.doc(`assessment_overrides/${ids.a}_${ids.student}`);

// ─── Firestore rules (REST, unsigned emulator tokens) ─────────────
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
  sub: uid, user_id: uid, aud: 'demo-spartan-booking', iss: 'https://securetoken.google.com/demo-spartan-booking',
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  firebase: { sign_in_provider: 'custom', identities: {} },
})}.`;
const base = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-spartan-booking/databases/(default)/documents`;
const headers = uid => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token(uid)}` });
const str = value => ({ stringValue: value });
const int = value => ({ integerValue: String(value) });
const request = (uid, method, path, fields, mask) => fetch(`${base}/${path}${mask ? `?${mask.map(k => `updateMask.fieldPaths=${k}`).join('&')}` : ''}`,
  { method, headers: headers(uid), ...(fields ? { body: JSON.stringify({ fields }) } : {}) }).then(r => r.status);

/** Mirrors what assessmentService.startAttempt writes (web and mobile). */
function createAttempt(ids, uid, n, overrides = {}) {
  const fields = {
    assessmentId: str(ids.a), studentId: str(uid), campus: str('lipa'), answers: { arrayValue: {} }, status: str('in_progress'),
    startedAt: { timestampValue: new Date().toISOString() }, attemptNumber: int(n),
    createdAt: { timestampValue: new Date().toISOString() }, updatedAt: { timestampValue: new Date().toISOString() }, ...overrides,
  };
  return request(uid, 'PATCH', `assessment_attempts/${ids.a}_${uid}_${n}`, fields);
}
const setOverride = (ids, value) => db.doc(`assessment_overrides/${ids.a}_${ids.student}`)
  .set({ assessmentId: ids.a, studentId: ids.student, maxAttemptsOverride: value, grantedBy: ids.admin, grantedAt: Timestamp.now(), reason: 'test' });

test('rules: first attempt is allowed, and the start payload used by web and mobile passes', async () => {
  const ids = await setup();
  assert.equal(await createAttempt(ids, ids.student, 1), 200);
});

test('rules: retake needs the previous attempt to be submitted/graded and stays within the default limit', async () => {
  const ids = await setup({ maxAttempts: 2 });
  assert.equal(await createAttempt(ids, ids.student, 2), 403, 'n=2 with no attempt 1');
  await attemptDoc(ids, ids.student, 1, 'in_progress');
  assert.equal(await createAttempt(ids, ids.student, 2), 403, 'previous attempt still in progress');
  await attemptDoc(ids, ids.student, 1, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 2), 200, 'retake after a submitted attempt');
  await attemptDoc(ids, ids.student, 2, 'graded');
  assert.equal(await createAttempt(ids, ids.student, 3), 403, 'beyond the limit of 2');
  assert.equal(await createAttempt(ids, ids.student, 4), 403, 'skipping ahead');
});

test('rules: an override raises the limit, lowering it blocks again, removing it restores the default', async () => {
  const ids = await setup({ maxAttempts: 2 });
  await attemptDoc(ids, ids.student, 1, 'submitted');
  await attemptDoc(ids, ids.student, 2, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 3), 403);
  await setOverride(ids, 3);
  assert.equal(await createAttempt(ids, ids.student, 3), 200, 'override raised the limit to 3');
  await attemptDoc(ids, ids.student, 3, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 4), 403, 'the raised limit still applies');
  await setOverride(ids, 10);
  assert.equal(await createAttempt(ids, ids.student, 4), 200);
  // Lower than the default: the override replaces it (same as mobile).
  const low = await setup({ maxAttempts: 3 });
  await attemptDoc(low, low.student, 1, 'submitted');
  await setOverride(low, 1);
  assert.equal(await createAttempt(low, low.student, 2), 403, 'override of 1 lowers the default of 3');
  await overrideRef(low).delete();
  assert.equal(await createAttempt(low, low.student, 2), 200, 'default applies again after removal');
});

test('rules: resuming an in-progress attempt never hits the limit', async () => {
  const ids = await setup({ maxAttempts: 2 });
  await attemptDoc(ids, ids.student, 1, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 2), 200);
  await setOverride(ids, 1); // limit now lower than the attempt in progress
  const path = `assessment_attempts/${ids.a}_${ids.student}_2`;
  assert.equal(await request(ids.student, 'GET', path), 200);
  assert.equal(await request(ids.student, 'PATCH', path, { answers: { arrayValue: { values: [{ mapValue: { fields: { questionId: str('q1'), value: str('2') } } }] } } }, ['answers']), 200);
  assert.equal(await request(ids.student, 'PATCH', path, { status: str('submitted') }, ['status']), 200);
});

test('rules: parallel creates cannot exceed the limit', async () => {
  const ids = await setup({ maxAttempts: 3 });
  await attemptDoc(ids, ids.student, 1, 'submitted');
  const results = await Promise.all([createAttempt(ids, ids.student, 2), createAttempt(ids, ids.student, 3), createAttempt(ids, ids.student, 4)]);
  assert.deepEqual(results, [200, 403, 403], 'only the next attempt is accepted');
  const duplicates = await Promise.all([createAttempt(ids, ids.other, 1), createAttempt(ids, ids.other, 1), createAttempt(ids, ids.other, 1)]);
  assert.ok(duplicates.every(status => status === 200));
  assert.equal((await db.collection('assessment_attempts').where('studentId', '==', ids.other).get()).size, 1, 'same id, still one attempt');
});

test('rules: malformed attempts are denied (id/number mismatch, other student, bad types, missing assessment)', async () => {
  const ids = await setup();
  const wrongId = await request(ids.student, 'PATCH', `assessment_attempts/${ids.a}_${ids.student}_7`, {
    assessmentId: str(ids.a), studentId: str(ids.student), status: str('in_progress'), attemptNumber: int(1) });
  assert.equal(wrongId, 403);
  assert.equal(await createAttempt(ids, ids.student, 1, { studentId: str(ids.other) }), 403);
  assert.equal(await createAttempt(ids, ids.student, 1, { attemptNumber: str('1') }), 403);
  assert.equal(await createAttempt(ids, ids.student, 1, { status: str('submitted') }), 403);
  assert.equal(await request(ids.student, 'PATCH', 'assessment_attempts/ghost_x_1', {
    assessmentId: str('ghost'), studentId: str(ids.student), status: str('in_progress'), attemptNumber: int(1) }), 403);
  assert.equal(await request(ids.fac, 'PATCH', `assessment_attempts/${ids.a}_${ids.fac}_1`, {
    assessmentId: str(ids.a), studentId: str(ids.fac), status: str('in_progress'), attemptNumber: int(1) }), 403, 'only students create attempts');
});

// ─── assessment_overrides: direct client writes by a super admin only ───
const tsNow = () => ({ timestampValue: new Date().toISOString() });
const docName = id => `projects/demo-spartan-booking/databases/(default)/documents/assessment_overrides/${id}`;
/** Create/replace with a real server timestamp for grantedAt (what the web client sends). */
async function writeOverride(uid, id, fields, { serverTime = true } = {}) {
  const res = await fetch(`${base}:commit`, { method: 'POST', headers: headers(uid), body: JSON.stringify({ writes: [{
    update: { name: docName(id), fields },
    ...(serverTime ? { updateTransforms: [{ fieldPath: 'grantedAt', setToServerValue: 'REQUEST_TIME' }] } : {}),
  }] }) });
  return res.status;
}
const goodFields = (ids, extra = {}) => ({
  assessmentId: str(ids.a), studentId: str(ids.student), maxAttemptsOverride: int(4), grantedBy: str(ids.admin),
  grantedAt: tsNow(), reason: str('Medical leave'), ...extra,
});
const overrideId = ids => `${ids.a}_${ids.student}`;

test('rules: a super admin can set, update and remove an override, and the doc has the mobile fields', async () => {
  const ids = await setup();
  assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids)), 200, 'set');
  const created = (await overrideRef(ids).get()).data();
  assert.deepEqual(Object.keys(created).sort(), ['assessmentId', 'grantedAt', 'grantedBy', 'maxAttemptsOverride', 'reason', 'studentId']);
  assert.equal(created.maxAttemptsOverride, 4);
  assert.equal(created.grantedBy, ids.admin);
  assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { maxAttemptsOverride: int(6), reason: str('Extended') })), 200, 'update');
  assert.equal((await overrideRef(ids).get()).data().maxAttemptsOverride, 6);
  assert.equal(await request(ids.admin, 'DELETE', `assessment_overrides/${overrideId(ids)}`), 200, 'remove');
  assert.equal((await overrideRef(ids).get()).exists, false);
  // Boundaries 1 and 10 are valid.
  for (const cap of [1, 10]) assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { maxAttemptsOverride: int(cap) })), 200);
});

test('rules: facilitators, students and an inactive admin cannot write or remove overrides', async () => {
  const ids = await setup();
  await setOverride(ids, 3);
  for (const uid of [ids.fac, ids.student, ids.other, ids.iadmin]) {
    assert.equal(await writeOverride(uid, overrideId(ids), goodFields(ids, { grantedBy: str(uid) })), 403, `create/update as ${uid}`);
    assert.equal(await writeOverride(uid, `${ids.a}_${ids.other}`, goodFields(ids, { studentId: str(ids.other), grantedBy: str(uid) })), 403, `create as ${uid}`);
    assert.equal(await request(uid, 'DELETE', `assessment_overrides/${overrideId(ids)}`), 403, `delete as ${uid}`);
  }
  // A student raising their own cap via a plain PATCH is denied too.
  assert.equal(await request(ids.student, 'PATCH', `assessment_overrides/${overrideId(ids)}`, { maxAttemptsOverride: int(10) }, ['maxAttemptsOverride']), 403);
  assert.equal((await overrideRef(ids).get()).data().maxAttemptsOverride, 3);
});

test('rules: out-of-range, fractional and non-integer caps are rejected', async () => {
  const ids = await setup();
  for (const value of [int(0), int(11), int(-1), { doubleValue: 2.5 }, { doubleValue: 3 }, str('3'), { nullValue: null }]) {
    assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { maxAttemptsOverride: value })), 403, JSON.stringify(value));
  }
  assert.equal((await overrideRef(ids).get()).exists, false);
});

test('rules: a missing, blank or oversized reason is rejected', async () => {
  const ids = await setup();
  const withoutReason = goodFields(ids);
  delete withoutReason.reason;
  assert.equal(await writeOverride(ids.admin, overrideId(ids), withoutReason), 403, 'missing');
  for (const reason of [str(''), str('   '), str('\n\t'), str('x'.repeat(501)), int(5)]) {
    assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { reason })), 403, JSON.stringify(reason).slice(0, 30));
  }
  assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { reason: str('x'.repeat(500)) })), 200, '500 characters is allowed');
});

test('rules: the document id must equal assessmentId_studentId', async () => {
  const ids = await setup();
  assert.equal(await writeOverride(ids.admin, `${ids.a}_${ids.other}`, goodFields(ids)), 403, 'id for another student');
  assert.equal(await writeOverride(ids.admin, `${ids.student}_${ids.a}`, goodFields(ids)), 403, 'swapped parts');
  assert.equal(await writeOverride(ids.admin, 'anything', goodFields(ids)), 403, 'arbitrary id');
  assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { assessmentId: str('other-assessment') })), 403, 'assessmentId disagrees with id');
});

test('rules: grantedBy, grantedAt, extra or missing fields and non-student targets are rejected', async () => {
  const ids = await setup();
  assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { grantedBy: str(ids.fac) })), 403, 'grantedBy is someone else');
  assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids), { serverTime: false }), 403, 'client-chosen grantedAt');
  assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { extra: str('x') })), 403, 'extra field');
  assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { createdAt: tsNow() })), 403, 'createdAt is not part of the shape');
  for (const field of ['assessmentId', 'studentId', 'grantedBy', 'grantedAt', 'maxAttemptsOverride']) {
    const fields = goodFields(ids);
    delete fields[field];
    assert.equal(await writeOverride(ids.admin, overrideId(ids), fields, { serverTime: field !== 'grantedAt' }), 403, `missing ${field}`);
  }
  assert.equal(await writeOverride(ids.admin, `${ids.a}_${ids.fac}`, goodFields(ids, { studentId: str(ids.fac) })), 403, 'a facilitator is not a student');
  assert.equal(await writeOverride(ids.admin, `${ids.a}_ghost`, goodFields(ids, { studentId: str('ghost') })), 403, 'unknown user');
  assert.equal((await overrideRef(ids).get()).exists, false);
});

test('rules: an override written through the client rule is honored by the attempt limit', async () => {
  const ids = await setup({ maxAttempts: 1 });
  await attemptDoc(ids, ids.student, 1, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 2), 403);
  assert.equal(await writeOverride(ids.admin, overrideId(ids), goodFields(ids, { maxAttemptsOverride: int(2) })), 200);
  assert.equal(await createAttempt(ids, ids.student, 2), 200, 'the new allowance lets the retake start');
  await attemptDoc(ids, ids.student, 2, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 3), 403, 'the limit still applies afterwards');
});

test('rules: overrides are readable by their student, facilitators and admins only', async () => {
  const ids = await setup();
  await setOverride(ids, 3);
  const path = `assessment_overrides/${overrideId(ids)}`;
  for (const uid of [ids.student, ids.fac, ids.admin]) assert.equal(await request(uid, 'GET', path), 200);
  assert.equal(await request(ids.other, 'GET', path), 403);
});

test('rules: super admins can record the new audit actions, others cannot', async () => {
  const ids = await setup();
  const audit = (uid, action, resource) => request(uid, 'PATCH', `audit_logs/aud_${Date.now()}_${Math.random().toString(36).slice(2)}`, {
    actorId: str(uid), action: str(action), resource: str(resource), resourceId: str(overrideId(ids)) });
  assert.equal(await audit(ids.admin, 'SUPERADMIN_SET_ASSESSMENT_OVERRIDE', 'assessment_overrides'), 200);
  assert.equal(await audit(ids.admin, 'SUPERADMIN_REMOVED_ASSESSMENT_OVERRIDE', 'assessment_overrides'), 200);
  assert.equal(await audit(ids.admin, 'SOMETHING_ELSE', 'assessment_overrides'), 403);
  assert.equal(await audit(ids.fac, 'SUPERADMIN_SET_ASSESSMENT_OVERRIDE', 'assessment_overrides'), 403);
});

test('rules: a student cannot bypass the limit by overwriting a submitted attempt', async () => {
  const ids = await setup({ maxAttempts: 1 });
  await attemptDoc(ids, ids.student, 1, 'submitted');
  assert.equal(await request(ids.student, 'PATCH', `assessment_attempts/${ids.a}_${ids.student}_1`, { status: str('in_progress') }, ['status']), 403);
  assert.equal(await createAttempt(ids, ids.student, 2), 403);
});

// ─── Reproduction: "Failed to create assessment_attempts/<id>_5" ────────
test('repro: default limit 4, four submitted attempts, no override -> attempt 5 is denied', async () => {
  const ids = await setup({ maxAttempts: 4 });
  for (let n = 1; n <= 4; n += 1) await attemptDoc(ids, ids.student, n, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 5), 403);
  assert.equal((await db.doc(`assessment_attempts/${ids.a}_${ids.student}_5`).get()).exists, false);
});

test('repro: the same student with an override of 6 -> attempts 5 and 6 are allowed, 7 is not', async () => {
  const ids = await setup({ maxAttempts: 4 });
  for (let n = 1; n <= 4; n += 1) await attemptDoc(ids, ids.student, n, 'submitted');
  await setOverride(ids, 6);
  assert.equal(await createAttempt(ids, ids.student, 5), 200);
  await attemptDoc(ids, ids.student, 5, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 6), 200);
  await attemptDoc(ids, ids.student, 6, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 7), 403);
});

test('repro: attempt 4 left in_progress -> attempt 5 is denied until 4 is submitted', async () => {
  const ids = await setup({ maxAttempts: 10 });
  for (let n = 1; n <= 3; n += 1) await attemptDoc(ids, ids.student, n, 'submitted');
  await attemptDoc(ids, ids.student, 4, 'in_progress');
  assert.equal(await createAttempt(ids, ids.student, 5), 403, 'limit is fine, but attempt 4 is not finished');
  await attemptDoc(ids, ids.student, 4, 'submitted');
  assert.equal(await createAttempt(ids, ids.student, 5), 200);
});

// ─── Client check vs rule: where they can disagree ──────────────────────
// The client counts submitted/graded attempts (count) and creates id ..._{count+1}; the rule
// requires the number to follow a submitted/graded attempt n-1 and not exceed the limit.
test('agreement: with contiguous attempts, client and rule allow exactly the same next attempt', async () => {
  for (const max of [1, 2, 3, 4]) {
    for (const override of [null, 2, 6]) {
      const limit = override ?? max;
      for (let used = 0; used <= 6; used += 1) {
        const ids = await setup({ maxAttempts: max });
        if (override) await setOverride(ids, override);
        for (let n = 1; n <= used; n += 1) await attemptDoc(ids, ids.student, n, n % 2 ? 'submitted' : 'graded');
        const clientAllows = used < limit; // startAttempt: attemptCount >= effectiveMax -> refuse
        const ruleAllows = (await createAttempt(ids, ids.student, used + 1)) === 200;
        assert.equal(ruleAllows, clientAllows, `max=${max} override=${override} used=${used}`);
      }
    }
  }
});

test('mismatch: a legacy/out-of-sequence attempt makes the client pick an id the rule refuses', async () => {
  const ids = await setup({ maxAttempts: 10 });
  for (let n = 1; n <= 3; n += 1) await attemptDoc(ids, ids.student, n, 'submitted');
  // A fourth submitted attempt stored under a different id (e.g. created before the {a}_{s}_{n} scheme).
  await db.doc(`assessment_attempts/legacy-attempt`).set({ assessmentId: ids.a, studentId: ids.student, status: 'submitted', attemptNumber: 4, answers: [] });
  // Client: count = 4 -> id _5. Rule: attempt _4 does not exist -> denied.
  assert.equal(await createAttempt(ids, ids.student, 5), 403);
});

test('mismatch: when the id the client picks already exists (finished), the write is an update and is refused', async () => {
  const ids = await setup({ maxAttempts: 10 });
  for (const n of [1, 2, 3, 5]) await attemptDoc(ids, ids.student, n, 'submitted'); // gap: no attempt 4
  // Client: count = 4 -> id _5, which already exists as a submitted attempt.
  assert.equal(await createAttempt(ids, ids.student, 5), 403);
});
