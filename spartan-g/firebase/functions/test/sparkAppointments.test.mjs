import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, terminate, doc, updateDoc, setDoc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error('Local emulator required.');
const projectId = 'demo-spartan-booking';
initializeAdminApp({ projectId });
const admin = getAdminFirestore();
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const windowUrl = moduleUrl(transpile(await readFile(new URL('../../../packages/shared-types/src/utils/booking-window.ts', import.meta.url), 'utf8')));
let source = transpile(await readFile(new URL('../../../packages/shared-services/src/services/appointment-booking.client.ts', import.meta.url), 'utf8'));
source = source.replaceAll("'firebase/firestore'", JSON.stringify(import.meta.resolve('firebase/firestore')))
  .replaceAll("'firebase/auth'", JSON.stringify(import.meta.resolve('firebase/auth')))
  .replaceAll("'@spartan-g/shared-types'", JSON.stringify(windowUrl))
  .replace(/import \{ getFirebaseApp \} from '[^']+';/, 'const getFirebaseApp = () => { throw new Error("Test must pass the client identity explicitly"); };')
  .replace(/import \{ getFirestoreDb \} from '[^']+';/, 'const getFirestoreDb = () => { throw new Error("Test must pass emulator db explicitly"); };');
const { bookAppointmentClient: book, acceptAppointmentClient: accept } = await import(moduleUrl(source));
const { getBookingWindow } = await import(windowUrl);
const clients = [];
let sequence = 0;
function client(uid) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `spark_${uid}_${clients.length}`);
  const db = getFirestore(app), [address, port] = host.split(':');
  connectFirestoreEmulator(db, address, Number(port), uid ? { mockUserToken: { sub: uid, user_id: uid } } : {});
  clients.push({ app, db });
  return db;
}
after(async () => { for (const { app, db } of clients) { await terminate(db); await deleteApp(app); } });
async function setup() {
  const prefix = `spark_${Date.now()}_${++sequence}`;
  const ids = Object.fromEntries(['s1', 's2', 'f1', 'f2', 'disabled'].map(key => [key, `${prefix}_${key}`]));
  const batch = admin.batch();
  for (const [key, uid] of Object.entries(ids)) batch.set(admin.doc(`users/${uid}`), {
    role: key.startsWith('f') ? 'facilitator' : 'student', isActive: key !== 'disabled',
  });
  batch.set(admin.doc('appointment_booking_config/spark'), { version: 1 });
  await batch.commit();
  const start = Math.ceil((Date.now() + 3600000) / 1800000) * 1800000;
  // Avoid CI accidentally booking beyond the week at the very end of Saturday.
  assert.ok(start + 7200000 < getBookingWindow(Date.now()).endMs, 'Run integration tests before the end of Saturday Manila time.');
  return { ...ids, start, c1: client(ids.s1), c2: client(ids.s2), f: client(ids.f1) };
}
const input = (ids, changes = {}) => ({ studentId: ids.s1, facilitatorId: ids.f1, scheduledAt: new Date(ids.start), durationMinutes: 60, ...changes });
const denied = promise => assert.rejects(promise);

test('actual client booking atomically writes appointment, four reservations and notification', async () => {
  const ids = await setup();
  const id = await book(input(ids), ids.c1, ids.s1);
  const appointment = (await admin.doc(`appointments/${id}`).get()).data();
  assert.equal(appointment.status, 'requested');
  assert.equal(appointment.studentId, ids.s1);
  const reservations = await admin.collection('appointment_reservations').where('appointmentId', '==', id).get();
  assert.equal(reservations.size, 4);
  assert.ok(reservations.docs.every(row => !('notes' in row.data())));
  const notifications = await admin.collection('notifications').where('relatedId', '==', id).get();
  assert.equal(notifications.size, 1);
});

test('simultaneous bookings for the same facilitator have exactly one winner', async () => {
  const ids = await setup();
  const results = await Promise.allSettled([
    book(input(ids), ids.c1, ids.s1),
    book(input(ids, { studentId: ids.s2 }), ids.c2, ids.s2),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});

test('one student cannot concurrently book overlapping times with different facilitators', async () => {
  const ids = await setup();
  const results = await Promise.allSettled([
    book(input(ids), ids.c1, ids.s1),
    book(input(ids, { facilitatorId: ids.f2 }), ids.c1, ids.s1),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});

test('half-hour overlaps fail, adjacent appointments succeed, cancellation releases reservations', async () => {
  const ids = await setup();
  const id = await book(input(ids), ids.c1, ids.s1);
  await denied(book(input(ids, { studentId: ids.s2, scheduledAt: new Date(ids.start + 1800000) }), ids.c2, ids.s2));
  await book(input(ids, { studentId: ids.s2, scheduledAt: new Date(ids.start + 3600000) }), ids.c2, ids.s2);
  await updateDoc(doc(ids.c1, 'appointments', id), { status: 'cancelled', updatedAt: serverTimestamp() });
  await book(input(ids, { studentId: ids.s2 }), ids.c2, ids.s2);
});

test('acceptance grants only the booked facilitator access and is idempotent after revocation', async () => {
  const ids = await setup();
  const id = await book(input(ids), ids.c1, ids.s1);
  await denied(accept(id, client(ids.f2), ids.f2));
  await denied(updateDoc(doc(ids.f, 'appointments', id), { status: 'accepted', acceptedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await accept(id, ids.f, ids.f1);
  assert.equal((await admin.doc(`appointments/${id}`).get()).data().status, 'accepted');
  const linkRef = admin.doc(`facilitator_student_links/${ids.f1}_${ids.s1}`);
  assert.equal((await linkRef.get()).data().status, 'accepted');
  assert.equal((await linkRef.get()).data().appointmentId, id);
  assert.equal((await admin.doc(`conversations/${[ids.f1, ids.s1].sort().join('_')}`).get()).exists, true);
  await linkRef.delete();
  await accept(id, ids.f, ids.f1);
  assert.equal((await linkRef.get()).exists, false);
});

test('rescheduling is owner-only, requires a request and releases the old time', async () => {
  const ids = await setup();
  const id = await book(input(ids), ids.c1, ids.s1);
  await denied(book(input(ids, { appointmentId: id, scheduledAt: new Date(ids.start + 3600000) }), ids.c1, ids.s1));
  await updateDoc(doc(ids.f, 'appointments', id), { status: 'reschedule_requested', updatedAt: serverTimestamp() });
  await denied(book(input(ids, { appointmentId: id, studentId: ids.s2 }), ids.c2, ids.s2));
  await book(input(ids, { appointmentId: id, scheduledAt: new Date(ids.start + 3600000) }), ids.c1, ids.s1);
  await book(input(ids, { studentId: ids.s2 }), ids.c2, ids.s2);
  assert.equal((await admin.doc(`appointments/${id}`).get()).data().scheduledAt.toMillis(), ids.start + 3600000);
});

test('acceptance handles existing pending links and permits active super administrators', async () => {
  const ids = await setup();
  const id = await book(input(ids), ids.c1, ids.s1);
  const requestedAt = AdminTimestamp.fromMillis(Date.now() - 3600000);
  await admin.doc(`facilitator_student_links/${ids.f1}_${ids.s1}`).set({ studentId: ids.s1, facilitatorId: ids.f1, status: 'pending', requestedAt });
  const uid = `${ids.s1}_admin`;
  await admin.doc(`users/${uid}`).set({ role: 'super_admin', isActive: true });
  await accept(id, client(uid), uid);
  const link = (await admin.doc(`facilitator_student_links/${ids.f1}_${ids.s1}`).get()).data();
  assert.equal(link.status, 'accepted');
  assert.equal(link.requestedAt.toMillis(), requestedAt.toMillis());
});

test('inactive participants and inconsistent conversations abort acceptance without partial grants', async () => {
  const ids = await setup();
  const id = await book(input(ids), ids.c1, ids.s1);
  await admin.doc(`users/${ids.s1}`).update({ isActive: false });
  await denied(accept(id, ids.f, ids.f1));
  await admin.doc(`users/${ids.s1}`).update({ isActive: true });
  await admin.doc(`conversations/${[ids.f1, ids.s1].sort().join('_')}`).set({ participantIds: [ids.f1, ids.s2] });
  await denied(accept(id, ids.f, ids.f1));
  assert.equal((await admin.doc(`appointments/${id}`).get()).data().status, 'requested');
  assert.equal((await admin.doc(`facilitator_student_links/${ids.f1}_${ids.s1}`).get()).exists, false);
});

test('race between reschedule and another request has one winner', async () => {
  const ids = await setup();
  const id = await book(input(ids), ids.c1, ids.s1);
  await updateDoc(doc(ids.f, 'appointments', id), { status: 'reschedule_requested', updatedAt: serverTimestamp() });
  const changes = { scheduledAt: new Date(ids.start + 3600000) };
  const results = await Promise.allSettled([
    book(input(ids, { ...changes, appointmentId: id }), ids.c1, ids.s1),
    book(input(ids, { ...changes, studentId: ids.s2 }), ids.c2, ids.s2),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});

// Construct a raw browser batch to exercise rules independently of client validation.
function rawBooking(ids, start = ids.start, overrides = {}, skip = -1) {
  const id = `raw_${Date.now()}_${++sequence}`, first = Math.floor(start / 1800000);
  const batch = writeBatch(ids.c1);
  const data = { studentId: ids.s1, facilitatorId: ids.f1, scheduledAt: Timestamp.fromMillis(start),
    durationMinutes: 60, status: 'requested', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), notifyBeforeMinutes: 30, ...overrides };
  batch.set(doc(ids.c1, 'appointments', id), data);
  const reservations = [['f', ids.f1, first], ['f', ids.f1, first + 1], ['s', ids.s1, first], ['s', ids.s1, first + 1]];
  reservations.forEach(([kind, participantId, slot], i) => {
    if (i !== skip) batch.set(doc(ids.c1, 'appointment_reservations', `${kind}_${participantId}_${slot}`), { kind, participantId, slot, appointmentId: id });
  });
  return batch.commit();
}

test('rules independently require every reservation and reject forged ownership, durations and times', async () => {
  const ids = await setup();
  for (let skip = 0; skip < 4; skip++) await denied(rawBooking(ids, ids.start, {}, skip));
  await denied(rawBooking(ids, ids.start, { studentId: ids.s2 }));
  await denied(rawBooking(ids, ids.start, { durationMinutes: 90 }));
  await denied(rawBooking(ids, ids.start + 60000));
  await denied(rawBooking(ids, Math.floor((Date.now() - 3600000) / 1800000) * 1800000));
  await denied(rawBooking(ids, getBookingWindow(Date.now()).endMs));
  await denied(rawBooking(ids, ids.start, { facilitatorId: ids.s2 }));
  await denied(setDoc(doc(ids.c1, 'facilitator_student_links', `${ids.f1}_${ids.s1}`), {
    facilitatorId: ids.f1, studentId: ids.s1, status: 'accepted', requestedAt: serverTimestamp(), respondedAt: serverTimestamp(),
  }));
});

test('inactive accounts, inactive facilitators and missing migration gate cannot book', async () => {
  const ids = await setup();
  await denied(book(input(ids, { studentId: ids.disabled }), client(ids.disabled), ids.disabled));
  await admin.doc(`users/${ids.f1}`).update({ isActive: false });
  await denied(book(input(ids), ids.c1, ids.s1));
  await admin.doc(`users/${ids.f1}`).update({ isActive: true });
  await admin.doc('appointment_booking_config/spark').delete();
  await denied(book(input(ids), ids.c1, ids.s1));
  await admin.doc('appointment_booking_config/spark').set({ version: 1 });
});

test('backfilled irregular legacy appointments still block overlapping bookings', async () => {
  const ids = await setup();
  const ref = admin.collection('appointments').doc();
  const start = ids.start + 60000, duration = 45;
  const batch = admin.batch();
  batch.set(ref, { studentId: ids.s1, facilitatorId: ids.f1, status: 'accepted', scheduledAt: AdminTimestamp.fromMillis(start), durationMinutes: duration });
  for (let slot = Math.floor(start / 1800000); slot < Math.ceil((start + duration * 60000) / 1800000); slot++) {
    for (const [kind, participantId] of [['f', ids.f1], ['s', ids.s1]]) batch.set(admin.doc(`appointment_reservations/${kind}_${participantId}_${slot}`), { kind, participantId, slot, appointmentId: ref.id });
  }
  await batch.commit();
  await denied(book(input(ids, { studentId: ids.s2 }), ids.c2, ids.s2));
});
