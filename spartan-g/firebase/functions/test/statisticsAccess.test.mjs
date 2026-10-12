import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error('Local Firestore emulator required.');
const projectId = 'demo-spartan-booking';
if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();
const { generateAdminStatistics, getAdminStatistics } = await import('../lib/adminStatistics.js');
const prefix = `statistics_${Date.now()}`;
const filters = { startDate: '2025-01-01', endDate: '2025-01-31', campus: '', assessmentId: prefix, interval: 'monthly' };
const users = ['admin', 'disabled', 'student', 'facilitator'];
for (const user of users) await db.doc(`users/${prefix}_${user}`).set({ role: user === 'admin' || user === 'disabled' ? 'super_admin' : user, isActive: user !== 'disabled', campus: 'lipa', createdAt: new Date('2024-01-01'), email: 'DO_NOT_EXPORT@example.com' });

test('backend and callable deny unauthenticated, student, facilitator and inactive admin access', async () => {
  for (const uid of ['', ...users.filter(user => user !== 'admin').map(user => `${prefix}_${user}`)]) {
    await assert.rejects(generateAdminStatistics(db, uid, filters), error => error.code === (uid ? 'permission-denied' : 'unauthenticated'));
  }
  await assert.rejects(getAdminStatistics.run({ auth: { uid: `${prefix}_student` }, data: filters }), error => error.code === 'permission-denied');
});
test('bad filters fail before reporting queries; authorized admin receives aggregates only', async () => {
  const uid = `${prefix}_admin`;
  await assert.rejects(generateAdminStatistics(db, uid, { ...filters, startDate: '2025-02-30' }), error => error.code === 'invalid-argument');
  await db.doc(`assessments/${prefix}`).set({ title: 'Synthetic example', questions: [] });
  await db.doc(`assessment_attempts/${prefix}`).set({ assessmentId: prefix, studentId: `${prefix}_student`, campus: 'lipa', status: 'submitted', startedAt: new Date('2025-01-03T00:00:00Z'), submittedAt: new Date('2025-01-04T00:00:00Z'), answers: [{ questionId: 'free-text', value: 'PRIVATE ANSWER' }] });
  const result = await generateAdminStatistics(db, uid, filters);
  assert.equal(result.totals.assessmentStudents, 1);
  assert.equal(result.totals.submissions, 1);
  for (const value of [`${prefix}_student`, 'DO_NOT_EXPORT@example.com', 'PRIVATE ANSWER', '"answers"']) assert.ok(!JSON.stringify(result).includes(value));
});
test('caller disabled during reads is denied before report delivery', async () => {
  let checks = 0;
  const guardedDb = {
    doc: path => path === `users/${prefix}_admin` ? { get: async () => ({ data: () => ({ role: 'super_admin', isActive: ++checks === 1 }) }) } : db.doc(path),
    collection: name => db.collection(name),
  };
  await assert.rejects(generateAdminStatistics(guardedDb, `${prefix}_admin`, filters), error => error.code === 'permission-denied');
  assert.equal(checks, 2);
});
test('record cap fails explicitly instead of silently producing a partial report', async () => {
  const boundedDb = {
    doc: () => ({ get: async () => ({ data: () => ({ role: 'super_admin', isActive: true }) }) }),
    collection: () => ({ select: () => ({ limit: count => ({ get: async () => ({ size: count, docs: [] }) }) }) }),
  };
  await assert.rejects(generateAdminStatistics(boundedDb, 'admin', filters), error => error.code === 'resource-exhausted');
});
