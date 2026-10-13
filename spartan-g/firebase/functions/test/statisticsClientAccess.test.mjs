import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { getApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, terminate } from 'firebase/firestore';
import { createFirestoreStatisticsSource, createStatisticsLoader, buildStatistics, SCALES } from './helpers/statisticsModules.mjs';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error('Local Firestore emulator required.');
const projectId = 'demo-spartan-booking';
if (!getApps().length) initializeAdminApp({ projectId });
const adminDb = getAdminFirestore();
const prefix = `browser_stats_${Date.now()}`;
const filters = { startDate: '2025-01-01', endDate: '2025-01-31', campus: '', assessmentId: prefix, interval: 'monthly' };
const clients = [];
function client(uid) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `${prefix}_${uid ?? 'anonymous'}_${clients.length}`);
  const db = getFirestore(app), [address, port] = host.split(':');
  connectFirestoreEmulator(db, address, Number(port), uid ? { mockUserToken: { sub: uid, user_id: uid } } : {});
  clients.push({ app, db });
  return createFirestoreStatisticsSource(db, () => uid ?? null);
}
after(async () => { for (const { app, db } of clients) { await terminate(db); await deleteApp(app); } });
const write = adminDb.batch();
for (const role of ['admin', 'disabled', 'student', 'facilitator']) write.set(adminDb.doc(`users/${prefix}_${role}`), {
  role: role === 'admin' || role === 'disabled' ? 'super_admin' : role, isActive: role !== 'disabled', campus: 'lipa', createdAt: new Date('2024-01-01'),
});
const ids = [...new Set(SCALES.flatMap(scale => scale.ids))];
write.set(adminDb.doc(`assessments/${prefix}`), { title: 'Synthetic standard assessment', analyticsScoringVersion: 'standard-v1', questions: ids.map(id => ({ id, type: 'multiple_choice', options: ['0', '1', '2', '3'].map(id => ({ id })) })) });
for (let i = 0; i < 5; i++) {
  const uid = `${prefix}_s${i}`, fac = `${prefix}_facilitator`, conversationId = `${fac}_${uid}`;
  write.set(adminDb.doc(`users/${uid}`), { role: 'student', isActive: true, campus: 'lipa', createdAt: new Date('2024-01-01'), email: 'PRIVATE@example.com' });
  write.set(adminDb.doc(`conversations/${conversationId}`), { participantIds: [uid, fac], lastMessagePreview: 'PRIVATE MESSAGE' });
  write.set(adminDb.doc(`facilitator_student_links/${conversationId}`), { studentId: uid, facilitatorId: fac, status: 'accepted', respondedAt: new Date('2024-12-01') });
  write.set(adminDb.doc(`messages/${conversationId}`), { senderId: uid, conversationId, body: 'PRIVATE MESSAGE', createdAt: new Date('2025-01-06') });
  write.set(adminDb.doc(`assessment_attempts/${conversationId}`), { assessmentId: prefix, studentId: uid, campus: 'lipa', status: 'submitted', startedAt: new Date('2025-01-03'), submittedAt: new Date('2025-01-05'), answers: ids.map(questionId => ({ questionId, value: '1' })) });
}
await write.commit();

test('actual browser SDK reads under release rules produce scores and messaging counts without a callable', async () => {
  const source = client(`${prefix}_admin`), input = await createStatisticsLoader(source).input();
  assert.ok(!JSON.stringify(input).includes('PRIVATE'));
  const report = buildStatistics(input, filters, new Date('2025-02-01'));
  assert.equal(report.totals.assessmentStudents, 5);
  assert.equal(report.totals.messagingStudents, 5);
  const phq = report.scores.find(score => score.instrument === 'PHQ-9');
  assert.equal(phq.sample, 5); assert.equal(phq.median, 9);
  assert.ok(!JSON.stringify(report).includes(`${prefix}_s0`));
});
test('student, facilitator, inactive admin and anonymous clients cannot globally list conversations', async () => {
  for (const role of ['student', 'facilitator', 'disabled', 'anonymous']) {
    const source = client(role === 'anonymous' ? null : `${prefix}_${role}`);
    await assert.rejects(source.records('conversations', 1001), error => error.code === 'permission-denied');
    await assert.rejects(createStatisticsLoader(source).input(), error => ['permission-denied', 'unauthenticated'].includes(error.code));
  }
});
test('existing participants can still read their own conversation; admin read change grants no message writes', async () => {
  const source = client(`${prefix}_s0`);
  const { doc, getDocFromServer, setDoc } = await import('firebase/firestore');
  const db = clients.at(-1).db;
  const conversationId = `${prefix}_facilitator_${prefix}_s0`;
  assert.equal((await getDocFromServer(doc(db, 'conversations', conversationId))).exists(), true);
  const adminSource = client(`${prefix}_admin`);
  assert.ok((await adminSource.records('conversations', 1001)).length >= 5);
  await assert.rejects(setDoc(doc(clients.at(-1).db, 'messages', `${prefix}_invalid_write`), { senderId: `${prefix}_s0`, conversationId, body: 'Unauthorized admin send' }), error => error.code === 'permission-denied');
  assert.equal(source.currentUid(), `${prefix}_s0`);
});
