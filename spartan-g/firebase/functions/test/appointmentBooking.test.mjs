import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { bookAppointment } from '../lib/appointmentBooking.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Tests require the Firestore emulator; never run against live data.');
initializeApp({ projectId: 'demo-spartan-booking' });
const db = getFirestore();
const start = Date.now() + 86400000;
let sequence = 0;
async function setup() {
  const id = `test_${Date.now()}_${++sequence}`;
  const facilitatorId = `${id}_facilitator`;
  const students = [`${id}_a`, `${id}_b`];
  await Promise.all([db.doc(`users/${facilitatorId}`).set({ role: 'facilitator', isActive: true }),
    ...students.map(uid => db.doc(`users/${uid}`).set({ role: 'student', isActive: true }))]);
  return { facilitatorId, students };
}
const input = (facilitatorId, time = start) => ({ facilitatorId, scheduledAtMs: time, durationMinutes: 60 });

test('a failed availability query aborts without any writes', async () => {
  const queryError = new Error('Availability query failed');
  let writes = 0;
  const ref = { id: 'new-appointment' };
  const fakeDb = {
    collection: name => ({ doc: () => ref, where: () => ({ query: true }) }),
    runTransaction: async callback => callback({
      get: async target => {
        if (target.query) throw queryError;
        return { data: () => ({ role: ++reads === 1 ? 'student' : 'facilitator', isActive: true }) };
      },
      set: () => { writes++; }, create: () => { writes++; }, update: () => { writes++; },
    }),
  };
  let reads = 0;
  await assert.rejects(bookAppointment(fakeDb, 'student', input('facilitator')), queryError);
  assert.equal(writes, 0);
});

test('simultaneous overlapping requests have exactly one winner, including an initially empty schedule', async () => {
  const { facilitatorId, students } = await setup();
  const results = await Promise.allSettled(students.map((uid, i) => bookAppointment(db, uid, input(facilitatorId, start + i * 1800000))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'already-exists');
  const saved = await db.collection('appointments').where('facilitatorId', '==', facilitatorId).get();
  assert.equal(saved.size, 1);
});
test('adjacent appointments succeed and existing legacy appointments block overlap', async () => {
  const { facilitatorId, students } = await setup();
  await db.collection('appointments').add({ facilitatorId, studentId: students[0], scheduledAt: Timestamp.fromMillis(start), durationMinutes: 60, status: 'accepted' });
  await assert.rejects(bookAppointment(db, students[1], input(facilitatorId, start + 1800000)), { code: 'already-exists' });
  await bookAppointment(db, students[1], input(facilitatorId, start + 3600000));
});
test('simultaneous reschedule and new request cannot take the same time', async () => {
  const { facilitatorId, students } = await setup();
  const old = await db.collection('appointments').add({ facilitatorId, studentId: students[0], scheduledAt: Timestamp.fromMillis(start - 3600000), durationMinutes: 60, status: 'reschedule_requested' });
  const results = await Promise.allSettled([
    bookAppointment(db, students[0], { ...input(facilitatorId), appointmentId: old.id }),
    bookAppointment(db, students[1], input(facilitatorId)),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'already-exists');
});
test('cancelled appointments release time and unauthorized reschedules fail', async () => {
  const { facilitatorId, students } = await setup();
  const old = await db.collection('appointments').add({ facilitatorId, studentId: students[0], scheduledAt: Timestamp.fromMillis(start), durationMinutes: 60, status: 'cancelled' });
  await bookAppointment(db, students[1], input(facilitatorId));
  await assert.rejects(bookAppointment(db, students[1], { ...input(facilitatorId), appointmentId: old.id }), { code: 'permission-denied' });
});
test('invalid input and inactive users cannot book', async () => {
  const { facilitatorId, students } = await setup();
  for (const durationMinutes of [0, -30, NaN, 1.5]) {
    await assert.rejects(bookAppointment(db, students[0], { ...input(facilitatorId), durationMinutes }), { code: 'invalid-argument' });
  }
  await assert.rejects(bookAppointment(db, students[0], input(facilitatorId, Date.now() - 1)), { code: 'invalid-argument' });
  await db.doc(`users/${students[0]}`).update({ isActive: false });
  await assert.rejects(bookAppointment(db, students[0], input(facilitatorId)), { code: 'permission-denied' });
});

test('rules reject direct booking, time edits and reactivation; allow student cancellation', async () => {
  const { facilitatorId, students } = await setup();
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: uid, user_id: uid, aud: 'demo-spartan-booking', iss: 'https://securetoken.google.com/demo-spartan-booking',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { sign_in_provider: 'custom', identities: {} },
  })}.`;
  const patch = async (uid, id, fields) => fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-spartan-booking/databases/(default)/documents/appointments/${id}?${Object.keys(fields).map(key => `updateMask.fieldPaths=${key}`).join('&')}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(uid)}` }, body: JSON.stringify({ fields }) },
  );
  assert.equal((await patch(students[0], 'direct-booking', {
    studentId: { stringValue: students[0] }, facilitatorId: { stringValue: facilitatorId }, status: { stringValue: 'requested' },
  })).status, 403);
  const { appointmentId } = await bookAppointment(db, students[0], input(facilitatorId));
  assert.equal((await patch(students[0], appointmentId, { scheduledAt: { timestampValue: new Date(start + 3600000).toISOString() } })).status, 403);
  assert.equal((await patch(facilitatorId, appointmentId, { durationMinutes: { integerValue: '120' } })).status, 403);
  assert.equal((await patch(students[0], appointmentId, { status: { stringValue: 'cancelled' } })).status, 200);
  assert.equal((await patch(facilitatorId, appointmentId, { status: { stringValue: 'accepted' } })).status, 403);
});

// ─── Student overlap ────────────────────────────────────────────
async function setupTwoFacilitators() {
  const id = `test_${Date.now()}_${++sequence}`;
  const facilitators = [`${id}_f1`, `${id}_f2`];
  const student = `${id}_s`;
  await Promise.all([
    ...facilitators.map(uid => db.doc(`users/${uid}`).set({ role: 'facilitator', isActive: true })),
    db.doc(`users/${student}`).set({ role: 'student', isActive: true }),
  ]);
  return { facilitators, student };
}

test('one student booking two facilitators at the same time: exactly one wins', async () => {
  const { facilitators, student } = await setupTwoFacilitators();
  const results = await Promise.allSettled(facilitators.map(f => bookAppointment(db, student, input(f))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.find(r => r.status === 'rejected').reason;
  assert.equal(rejected.code, 'already-exists');
  assert.equal(rejected.details.reason, 'student_overlap');
  assert.equal((await db.collection('appointments').where('studentId', '==', student).get()).size, 1);
});

test('overlapping but different start times are rejected for the same student', async () => {
  const { facilitators, student } = await setupTwoFacilitators();
  await bookAppointment(db, student, input(facilitators[0]));
  for (const offset of [-1800000, 1800000, 3599000]) {
    await assert.rejects(bookAppointment(db, student, input(facilitators[1], start + offset)),
      err => err.code === 'already-exists' && err.details.reason === 'student_overlap');
  }
});

test('back-to-back appointments for the same student are allowed', async () => {
  const { facilitators, student } = await setupTwoFacilitators();
  await bookAppointment(db, student, input(facilitators[0]));
  await bookAppointment(db, student, input(facilitators[1], start + 3600000));
  await bookAppointment(db, student, input(facilitators[1], start - 3600000));
  assert.equal((await db.collection('appointments').where('studentId', '==', student).get()).size, 3);
});

test('facilitator conflicts keep their own distinct error', async () => {
  const { facilitatorId, students } = await setup();
  await bookAppointment(db, students[0], input(facilitatorId));
  await assert.rejects(bookAppointment(db, students[1], input(facilitatorId)),
    err => err.code === 'already-exists' && err.details.reason === 'facilitator_overlap');
});

test('cancel then rebook the same time with another facilitator', async () => {
  const { facilitators, student } = await setupTwoFacilitators();
  const { appointmentId } = await bookAppointment(db, student, input(facilitators[0]));
  await assert.rejects(bookAppointment(db, student, input(facilitators[1])), { code: 'already-exists' });
  await db.doc(`appointments/${appointmentId}`).update({ status: 'cancelled' });
  await bookAppointment(db, student, input(facilitators[1]));
});

test('reschedule onto the student\'s own old slot is allowed; onto another active appointment is not', async () => {
  const { facilitators, student } = await setupTwoFacilitators();
  const mine = await db.collection('appointments').add({ facilitatorId: facilitators[0], studentId: student,
    scheduledAt: Timestamp.fromMillis(start), durationMinutes: 60, status: 'reschedule_requested' });
  await bookAppointment(db, student, { ...input(facilitators[0], start + 900000), appointmentId: mine.id });
  assert.equal((await mine.get()).data().status, 'requested');

  const other = await db.collection('appointments').add({ facilitatorId: facilitators[1], studentId: student,
    scheduledAt: Timestamp.fromMillis(start + 7200000), durationMinutes: 60, status: 'accepted' });
  const second = await db.collection('appointments').add({ facilitatorId: facilitators[0], studentId: student,
    scheduledAt: Timestamp.fromMillis(start + 86400000), durationMinutes: 60, status: 'reschedule_requested' });
  await assert.rejects(bookAppointment(db, student, { ...input(facilitators[0], start + 7200000), appointmentId: second.id }),
    err => err.details.reason === 'student_overlap');
  assert.equal((await other.get()).data().status, 'accepted');
});

test('a failing student overlap query aborts with no writes', async () => {
  const queryError = new Error('Student query failed');
  let writes = 0;
  let reads = 0;
  const ref = { id: 'new-appointment' };
  const fakeDb = {
    collection: () => ({ doc: () => ref, where: field => ({ field }) }),
    runTransaction: async callback => callback({
      get: async target => {
        if (target.field === 'studentId') throw queryError;
        if (target.field === 'facilitatorId') return { docs: [] };
        return { data: () => ({ role: ++reads === 1 ? 'student' : 'facilitator', isActive: true }) };
      },
      set: () => { writes++; }, create: () => { writes++; }, update: () => { writes++; },
    }),
  };
  await assert.rejects(bookAppointment(fakeDb, 'student', input('facilitator')), queryError);
  assert.equal(writes, 0);
});

test('booking lock documents are closed to every client', async () => {
  const { facilitatorId, students } = await setup();
  await bookAppointment(db, students[0], input(facilitatorId));
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = uid => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: uid, user_id: uid, aud: 'demo-spartan-booking', iss: 'https://securetoken.google.com/demo-spartan-booking',
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { sign_in_provider: 'custom', identities: {} },
  })}.`;
  const base = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-spartan-booking/databases/(default)/documents/appointment_booking_locks`;
  const call = (uid, id, method, body) => fetch(`${base}/${id}${method === 'PATCH' ? '?updateMask.fieldPaths=updatedAt' : ''}`,
    { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(uid)}` },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const [uid, id] of [[students[0], `student_${students[0]}`], [facilitatorId, facilitatorId], [students[1], `student_${students[0]}`]]) {
    assert.equal((await call(uid, id, 'GET')).status, 403);
    assert.equal((await call(uid, id, 'PATCH', { fields: { updatedAt: { stringValue: 'x' } } })).status, 403);
    assert.equal((await call(uid, id, 'DELETE')).status, 403);
  }
  assert.equal((await db.doc(`appointment_booking_locks/student_${students[0]}`).get()).exists, true);
});
