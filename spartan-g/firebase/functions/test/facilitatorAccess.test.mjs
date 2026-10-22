import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { acceptBookedAppointment } from '../lib/appointmentAcceptance.js';
import { requireStudentAccess } from '../lib/studentAccess.js';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error('Local emulator required.');
const project = 'demo-spartan-booking';
process.env.GCLOUD_PROJECT = project;
initializeApp({ projectId: project });
const db = getFirestore();
const { generateAssessmentSummary } = await import('../lib/assessmentSummary.js');
const { listPublishedDefinitions } = await import('../lib/assessmentDefinitions.js');
const database = `projects/${project}/databases/(default)`;
const base = `http://${host}/v1/${database}/documents`;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
  sub: uid, user_id: uid, aud: project, iss: `https://securetoken.google.com/${project}`,
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  firebase: { sign_in_provider: 'custom', identities: {} },
})}.`;
const headers = uid => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token(uid)}` });
function value(v) {
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: fields(v) } };
}
const fields = data => Object.fromEntries(Object.entries(data).map(([k, v]) => [k, value(v)]));
async function write(uid, path, data, serverFields = [], patch = false) {
  const response = await fetch(`${base}:commit`, { method: 'POST', headers: headers(uid),
    body: JSON.stringify({ writes: [{ update: { name: `${database}/documents/${path}`, fields: fields(data) },
      ...(patch ? { updateMask: { fieldPaths: Object.keys(data) } } : {}),
      updateTransforms: serverFields.map(fieldPath => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })),
    }] }) });
  return { status: response.status, body: await response.text() };
}
const check = (r, status) => assert.equal(r.status, status, r.body);
async function read(uid, path) {
  const response = await fetch(`${base}/${path}`, { headers: headers(uid) });
  return { status: response.status, body: await response.text() };
}
async function list(uid, collectionId, conditions) {
  const filters = conditions.map(([fieldPath, v]) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: value(v) } }));
  const response = await fetch(`${base}:runQuery`, { method: 'POST', headers: headers(uid),
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }],
      ...(filters.length ? { where: { compositeFilter: { op: 'AND', filters } } } : {}) } }) });
  return { status: response.status, body: await response.text() };
}
let sequence = 0;
async function setup({ assigned = true } = {}) {
  const prefix = `access_${Date.now()}_${++sequence}`;
  const ids = Object.fromEntries(['facA', 'facB', 'studentA', 'studentB', 'admin', 'disabled'].map(k => [k, `${prefix}_${k}`]));
  const writes = db.batch();
  for (const [key, uid] of Object.entries(ids)) writes.set(db.doc(`users/${uid}`), {
    uid, role: key.startsWith('student') ? 'student' : key === 'admin' ? 'super_admin' : 'facilitator',
    isActive: key !== 'disabled', email: `${key}@example.com`, displayName: key, campus: 'lipa',
  });
  for (const [facilitatorId, studentId] of [[ids.facA, ids.studentA], [ids.facB, ids.studentB]]) {
    if (assigned) writes.set(db.doc(`facilitator_student_links/${facilitatorId}_${studentId}`), {
      facilitatorId, studentId, status: 'accepted', requestedAt: new Date(),
    });
    if (assigned) writes.set(db.doc(`student_identity_consents/${facilitatorId}_${studentId}`), {
      facilitatorId, studentId, requestedAt: new Date(),
    });
    writes.set(db.doc(`profiles/${studentId}`), { uid: studentId, bio: 'Private profile' });
    for (const collection of ['assessment_attempts', 'assessment_responses', 'assessments', 'enrollments', 'submissions']) {
      writes.set(db.doc(`${collection}/${studentId}`), { studentId, assessmentId: 'definition',
        status: 'in_progress', answers: [], score: 2, attemptNumber: 1, isPublished: false });
    }
    writes.set(db.doc(`assessment_ai_summaries/${studentId}`), { attemptId: studentId, summary: 'Private cached summary' });
    writes.set(db.doc(`risk_alerts/${studentId}`), { studentId, facilitatorId, status: 'open', severity: 'high' });
    writes.set(db.doc(`assessment_overrides/${studentId}`), { studentId, assessmentId: 'definition', maxAttemptsOverride: 3 });
    writes.set(db.doc(`appointments/${studentId}`), { studentId, facilitatorId, status: 'requested',
      scheduledAt: new Date(Date.now() + 3600000), durationMinutes: 60, createdAt: new Date() });
  }
  await writes.commit();
  return ids;
}

test('privacy policy is readable by active accounts but only admins can publish validated revisions', async () => {
  const ids = await setup();
  const path = 'platform_settings/privacy_policy';
  await db.doc(path).delete();
  const policy = { title: 'Privacy Policy', body: 'First paragraph.\n\nSecond paragraph.', version: 1, updatedBy: ids.admin };
  check(await write(ids.studentA, path, { ...policy, updatedBy: ids.studentA }, ['updatedAt']), 403);
  check(await write(ids.facA, path, { ...policy, updatedBy: ids.facA }, ['updatedAt']), 403);
  check(await write(ids.admin, path, policy, ['updatedAt']), 200);
  for (const uid of [ids.studentA, ids.facA, ids.admin]) check(await read(uid, path), 200);
  check(await read(ids.disabled, path), 403);
  assert.equal((await fetch(`${base}/${path}`)).status, 403);
  check(await write(ids.admin, path, { ...policy, body: 'New policy', version: 2 }, ['updatedAt']), 200);
  check(await write(ids.admin, path, { ...policy, version: 2 }, ['updatedAt']), 403);
  for (const change of [{ body: '  \n ' }, { title: '   ' }, { body: 'x'.repeat(20001) },
    { title: 'x'.repeat(121) }, { updatedBy: ids.studentA }, { secret: 'extra field' }]) {
    check(await write(ids.admin, path, { ...policy, version: 3, ...change }, ['updatedAt']), 403);
  }
});

test('students can request only their own pending canonical relationship; no self-approval', async () => {
  const ids = await setup({ assigned: false });
  const path = `facilitator_student_links/${ids.facA}_${ids.studentA}`;
  const data = { facilitatorId: ids.facA, studentId: ids.studentA, status: 'pending' };
  check(await write(ids.studentA, path, { ...data, status: 'accepted' }, ['requestedAt']), 403);
  check(await write(ids.studentB, path, data, ['requestedAt']), 403);
  check(await write(ids.studentA, `${path}_fake`, data, ['requestedAt']), 403);
  check(await write(ids.facA, path, { ...data, status: 'accepted' }, ['requestedAt']), 403);
  check(await write(ids.studentA, path, data, ['requestedAt', 'createdAt', 'updatedAt']), 200);
  check(await write(ids.studentA, path, { status: 'accepted' }, ['respondedAt'], true), 403);
  check(await write(ids.facB, path, { status: 'accepted' }, ['respondedAt'], true), 403);
  check(await write(ids.facA, path, { status: 'accepted' }, ['respondedAt', 'updatedAt'], true), 200);
  check(await write(ids.facA, path, { studentId: ids.studentB }, [], true), 403);
  check(await write(ids.admin, path, { facilitatorId: ids.facB }, [], true), 403);
});

test('facilitators can read only assigned profiles and student records; admins retain access', async () => {
  const ids = await setup();
  for (const collection of ['users', 'profiles', 'assessment_attempts', 'assessment_responses', 'assessments',
    'risk_alerts', 'assessment_ai_summaries', 'assessment_overrides', 'enrollments', 'submissions', 'appointments']) {
    check(await read(ids.facA, `${collection}/${ids.studentA}`), 200);
    check(await read(ids.facB, `${collection}/${ids.studentA}`), 403);
    check(await read(ids.disabled, `${collection}/${ids.studentA}`), 403);
    check(await read(ids.admin, `${collection}/${ids.studentA}`), 200);
    const deletion = await fetch(`${base}/${collection}/${ids.studentA}`, { method: 'DELETE', headers: headers(ids.facB) });
    assert.equal(deletion.status, 403, await deletion.text());
  }
  check(await read(ids.studentA, `assessment_attempts/${ids.studentA}`), 200);
  check(await read(ids.studentB, `assessment_attempts/${ids.studentA}`), 403);
});

test('identity requires explicit student consent, not assignment, severity or staff writes', async () => {
  const ids = await setup();
  const path = `student_identity_consents/${ids.facA}_${ids.studentA}`;
  await db.doc(path).delete();
  await db.doc(`risk_alerts/${ids.studentA}`).update({ severity: 'critical' });
  for (const collection of ['users', 'profiles']) check(await read(ids.facA, `${collection}/${ids.studentA}`), 403);
  check(await read(ids.facA, `assessment_attempts/${ids.studentA}`), 200);
  const consent = { studentId: ids.studentA, facilitatorId: ids.facA };
  for (const actor of [ids.facA, ids.facB, ids.studentB, ids.admin, ids.disabled]) {
    check(await write(actor, path, consent, ['requestedAt']), 403);
  }
  check(await write(ids.studentA, path, { ...consent, requestedAt: new Date('2020-01-01') }), 403);
  check(await write(ids.studentA, `${path}_fake`, consent, ['requestedAt']), 403);
  check(await write(ids.studentA, path, { ...consent, name: 'must not duplicate identity' }, ['requestedAt']), 403);
  check(await write(ids.studentA, path, consent, ['requestedAt']), 200);
  for (const collection of ['users', 'profiles']) {
    check(await read(ids.facA, `${collection}/${ids.studentA}`), 200);
    check(await read(ids.facB, `${collection}/${ids.studentA}`), 403);
  }
  check(await read(ids.studentB, path), 403);
  check(await read(ids.facB, path), 403);
  const staffDelete = await fetch(`${base}/${path}`, { method: 'DELETE', headers: headers(ids.facA) });
  assert.equal(staffDelete.status, 403, await staffDelete.text());
  const revoke = await fetch(`${base}/${path}`, { method: 'DELETE', headers: headers(ids.studentA) });
  assert.equal(revoke.status, 200, await revoke.text());
  check(await read(ids.facA, `users/${ids.studentA}`), 403);
  check(await write(ids.studentA, path, consent, ['requestedAt']), 200);
  await db.doc(`facilitator_student_links/${ids.facA}_${ids.studentA}`).update({ status: 'pending' });
  check(await read(ids.facA, `users/${ids.studentA}`), 403, 'Consent alone cannot grant assignment access');
});

test('query authorization supports assignment-based website queries and denies global/foreign queries', async () => {
  const ids = await setup();
  check(await list(ids.facA, 'facilitator_student_links', [['facilitatorId', ids.facA], ['status', 'accepted']]), 200);
  check(await list(ids.facA, 'facilitator_student_links', [['facilitatorId', ids.facB]]), 403);
  check(await list(ids.facA, 'users', [['role', 'student']]), 403);
  check(await list(ids.facA, 'assessment_attempts', [['studentId', ids.studentA]]), 200);
  check(await list(ids.facA, 'assessment_attempts', [['studentId', ids.studentB]]), 403);
  check(await list(ids.facA, 'risk_alerts', [['facilitatorId', ids.facA], ['studentId', ids.studentA], ['status', 'open']]), 200);
  check(await list(ids.facA, 'risk_alerts', [['facilitatorId', ids.facB], ['studentId', ids.studentB]]), 403);
  check(await list(ids.facA, 'appointments', [['facilitatorId', ids.facA]]), 200);
  check(await list(ids.facA, 'appointments', [['facilitatorId', ids.facB]]), 403);
  await db.doc(`assessments/${ids.admin}`).set({ isPublished: true, courseId: 'screening', title: 'Screening' });
  check(await read(ids.facA, `assessments/${ids.admin}`), 200);
  const definitions = await listPublishedDefinitions(db, ids.facA);
  assert.ok(definitions.assessments.some(item => item.id === ids.admin));
});

test('student identity is immutable and unrelated staff cannot mutate sensitive records', async () => {
  const ids = await setup();
  for (const collection of ['assessment_attempts', 'assessment_responses', 'assessments', 'submissions', 'enrollments']) {
    check(await write(ids.studentA, `${collection}/${ids.studentA}`, { studentId: ids.studentB }, [], true), 403);
    check(await write(ids.facA, `${collection}/${ids.studentA}`, { studentId: ids.studentB }, [], true), 403);
    check(await write(ids.facB, `${collection}/${ids.studentA}`, { score: 100 }, [], true), 403);
  }
  check(await write(ids.facA, `risk_alerts/${ids.studentA}`, { status: 'acknowledged' }, [], true), 200);
  check(await write(ids.facA, `risk_alerts/${ids.studentA}`, { studentId: ids.studentB }, [], true), 403);
  check(await write(ids.facB, `risk_alerts/${ids.studentA}`, { status: 'resolved' }, [], true), 403);
  check(await write(ids.facA, `appointments/${ids.studentA}`, { status: 'accepted' }, [], true), 403);
  check(await write(ids.facB, `appointments/${ids.studentA}`, { facilitatorNotes: 'tampered' }, [], true), 403);
});

test('server appointment acceptance creates the relationship, conversation and one notification atomically', async () => {
  const ids = await setup({ assigned: false });
  await assert.rejects(acceptBookedAppointment(db, ids.facB, ids.studentA), { code: 'permission-denied' });
  await assert.rejects(acceptBookedAppointment(db, ids.studentA, ids.studentA), { code: 'permission-denied' });
  await assert.rejects(acceptBookedAppointment(db, ids.disabled, ids.studentA), { code: 'permission-denied' });
  check(await read(ids.facA, `assessment_attempts/${ids.studentA}`), 403);
  await Promise.all([acceptBookedAppointment(db, ids.facA, ids.studentA), acceptBookedAppointment(db, ids.facA, ids.studentA)]);
  assert.equal((await db.doc(`appointments/${ids.studentA}`).get()).data().status, 'accepted');
  assert.equal((await db.doc(`facilitator_student_links/${ids.facA}_${ids.studentA}`).get()).data().status, 'accepted');
  assert.deepEqual((await db.doc(`conversations/${[ids.facA, ids.studentA].sort().join('_')}`).get()).data().participantIds, [ids.facA, ids.studentA]);
  assert.equal((await db.collection('notifications').where('relatedId', '==', ids.studentA).get()).size, 1);
  check(await read(ids.facA, `assessment_attempts/${ids.studentA}`), 200);
  await acceptBookedAppointment(db, ids.admin, ids.studentB);
  assert.equal((await db.doc(`facilitator_student_links/${ids.facB}_${ids.studentB}`).get()).data().status, 'accepted');
});

test('revocation immediately denies backend reads and cached/forced AI summaries; retries cannot restore access', async () => {
  const ids = await setup();
  const call = (uid, force = false) => generateAssessmentSummary.run({ auth: { uid, token: {} }, data: { attemptId: ids.studentA, force } });
  assert.equal((await call(ids.facA)).cached, true);
  for (const uid of [ids.facB, ids.disabled, ids.studentA]) {
    await assert.rejects(call(uid), { code: 'permission-denied' });
    await assert.rejects(call(uid, true), { code: 'permission-denied' });
  }
  assert.equal((await call(ids.admin)).cached, true);
  await db.doc(`appointments/${ids.studentA}`).update({ status: 'accepted' });
  await db.doc(`facilitator_student_links/${ids.facA}_${ids.studentA}`).update({ status: 'rejected' });
  check(await read(ids.facA, `assessment_attempts/${ids.studentA}`), 403);
  await assert.rejects(requireStudentAccess(db, ids.facA, ids.studentA), { code: 'permission-denied' });
  await assert.rejects(call(ids.facA), { code: 'permission-denied' });
  await acceptBookedAppointment(db, ids.facA, ids.studentA);
  assert.equal((await db.doc(`facilitator_student_links/${ids.facA}_${ids.studentA}`).get()).data().status, 'rejected');
});

test('malformed relationships and conversations cannot grant access; acceptance failure writes nothing', async () => {
  const ids = await setup({ assigned: false });
  const linkRef = db.doc(`facilitator_student_links/${ids.facA}_${ids.studentA}`);
  await linkRef.set({ facilitatorId: ids.facB, studentId: ids.studentA, status: 'accepted', requestedAt: new Date() });
  check(await read(ids.facA, `profiles/${ids.studentA}`), 403);
  await assert.rejects(requireStudentAccess(db, ids.facA, ids.studentA), { code: 'permission-denied' });
  await assert.rejects(acceptBookedAppointment(db, ids.facA, ids.studentA), { code: 'failed-precondition' });
  assert.equal((await db.doc(`appointments/${ids.studentA}`).get()).data().status, 'requested');
  assert.equal((await db.doc(`notifications/accepted_${ids.studentA}`).get()).exists, false);
  await linkRef.delete();
  await db.doc(`conversations/${[ids.facA, ids.studentA].sort().join('_')}`).set({ participantIds: [ids.facA, ids.studentB] });
  await assert.rejects(acceptBookedAppointment(db, ids.facA, ids.studentA), { code: 'failed-precondition' });
  assert.equal((await linkRef.get()).exists, false);
  assert.equal((await db.doc(`appointments/${ids.studentA}`).get()).data().status, 'requested');
});

test('Spark catalog is readable by active accounts and rejects anonymous, inactive, and client writes', async () => {
  const ids = await setup();
  await db.doc(`assessment_catalog/${ids.admin}`).set({ title: 'Screening', isPublished: true });
  for (const uid of [ids.studentA, ids.facA, ids.admin]) {
    check(await list(uid, 'assessment_catalog', [['isPublished', true]]), 200);
    check(await write(uid, `assessment_catalog/${ids.admin}`, { title: 'Tampered', isPublished: true }), 403);
  }
  check(await list(ids.disabled, 'assessment_catalog', [['isPublished', true]]), 403);
  const response = await fetch(`${base}/assessment_catalog/${ids.admin}`);
  assert.equal(response.status, 403);
  await db.doc(`assessment_catalog/${ids.admin}`).update({ isPublished: false });
  check(await read(ids.studentA, `assessment_catalog/${ids.admin}`), 403);
});

test('publication never makes a private student assessment public; definition lists project only safe fields', async () => {
  const ids = await setup();
  await db.doc(`assessments/${ids.studentA}`).update({ isPublished: true, courseId: 'screening' });
  check(await read(ids.facB, `assessments/${ids.studentA}`), 403);
  check(await read(ids.studentB, `assessments/${ids.studentA}`), 403);
  await db.doc(`assessments/${ids.admin}`).set({ isPublished: true, courseId: 'screening', title: 'Screening',
    reviewNotes: 'Private legacy metadata', questions: [{ id: 'q1', text: 'Question', type: 'multiple_choice',
      order: 1, points: 3, privateNote: 'Must not be exposed', options: [{ id: '0', label: 'Never', privateNote: 'Hidden' }] }] });
  for (const uid of [ids.facA, ids.facB, ids.studentB]) {
    const result = await listPublishedDefinitions(db, uid);
    assert.equal(result.assessments.some(item => item.id === ids.studentA), false);
    const definition = result.assessments.find(item => item.id === ids.admin);
    assert.equal(definition.title, 'Screening');
    assert.equal('reviewNotes' in definition, false);
    assert.equal('privateNote' in definition.questions[0], false);
    assert.equal('privateNote' in definition.questions[0].options[0], false);
  }
  await assert.rejects(listPublishedDefinitions(db, ''), { code: 'unauthenticated' });
  await assert.rejects(listPublishedDefinitions(db, ids.disabled), { code: 'permission-denied' });
});
