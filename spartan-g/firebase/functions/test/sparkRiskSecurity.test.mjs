import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, terminate, doc, updateDoc, setDoc } from 'firebase/firestore';

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(localhost|127\.0\.0\.1):\d+$/.test(host)) throw new Error('Local demo Firestore emulator required.');
const projectId = 'demo-spartan-booking';
initializeAdminApp({ projectId });
const admin = getAdminFirestore();
const transpile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const scoringUrl = moduleUrl(transpile(await readFile(new URL('../../../packages/shared-types/src/utils/scoring.ts', import.meta.url), 'utf8')));
const riskUrl = moduleUrl(transpile(await readFile(new URL('../../../packages/shared-types/src/utils/risk-evaluation.ts', import.meta.url), 'utf8'))
  .replace(/(['"])\.\/scoring\1/g, JSON.stringify(scoringUrl)));
const { evaluateSubmittedRisk } = await import(riskUrl);
const sdkUrl = import.meta.resolve('firebase/firestore');
const boundaries = moduleUrl(`
export { Timestamp } from ${JSON.stringify(sdkUrl)};
export { evaluateSubmittedRisk } from ${JSON.stringify(riskUrl)};
export const PERMISSIONS = { VIEW_RISK_ALERTS: 'view' };
export const hasPermission = role => ['facilitator', 'super_admin'].includes(role);
export class PermissionError extends Error {}
export const getFirestoreDb = () => globalThis.__sparkRiskDb;
export const riskAlertRepository = { update: async (id, data) => {
  const { doc, updateDoc } = await import(${JSON.stringify(sdkUrl)});
  await updateDoc(doc(globalThis.__sparkRiskDb, 'risk_alerts', id), data);
} };
`);
let source = transpile(await readFile(new URL('../../../packages/shared-services/src/services/risk-alert.service.ts', import.meta.url), 'utf8'));
source = source.replace(/(['"])@spartan-g\/shared-types\1/g, JSON.stringify(boundaries))
  .replace(/(['"])\.\.\/firebase\/firestore\1/g, JSON.stringify(boundaries))
  .replace(/(['"])\.\.\/repositories\/risk-alert\.repository\1/g, JSON.stringify(boundaries))
  .replace(/(['"])firebase\/firestore\1/g, JSON.stringify(sdkUrl));
const { riskAlertService } = await import(moduleUrl(source));
const clients = [];
function client(uid) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `risk_${uid}_${clients.length}`);
  const db = getFirestore(app), [address, port] = host.split(':');
  connectFirestoreEmulator(db, address, Number(port), { mockUserToken: { sub: uid, user_id: uid } });
  clients.push({ app, db });
  return db;
}
after(async () => { for (const { app, db } of clients) { await terminate(db); await deleteApp(app); } delete globalThis.__sparkRiskDb; });
let sequence = 0;
const answers = value => Array.from({ length: 9 }, (_, index) => ({ questionId: `phq${index + 1}`, value }));
async function setup(data = {}) {
  const prefix = `spark_risk_${Date.now()}_${++sequence}`;
  const ids = { fac: `${prefix}_fac`, other: `${prefix}_other`, student: `${prefix}_student`, assessment: `${prefix}_assessment`, attempt: `${prefix}_attempt` };
  const batch = admin.batch();
  for (const [uid, role] of [[ids.fac, 'facilitator'], [ids.other, 'facilitator'], [ids.student, 'student']]) batch.set(admin.doc(`users/${uid}`), { uid, role, isActive: true });
  batch.set(admin.doc(`facilitator_student_links/${ids.fac}_${ids.student}`), { facilitatorId: ids.fac, studentId: ids.student, status: 'accepted' });
  batch.set(admin.doc(`assessments/${ids.assessment}`), { maxAttempts: 1, isPublished: true });
  batch.set(admin.doc(`assessment_attempts/${ids.attempt}`), { studentId: ids.student, assessmentId: ids.assessment, status: 'submitted', submittedAt: new Date(), answers: answers('3'), ...data });
  await batch.commit();
  return ids;
}

test('complete instrument responses score independently of stored classification', () => {
  assert.equal(evaluateSubmittedRisk(answers('3')).overallRiskLevel, 'high');
  assert.equal(evaluateSubmittedRisk(answers('0')).overallRiskLevel, 'low');
  assert.equal(evaluateSubmittedRisk(answers(3)).overallRiskScore, 40);
});

test('missing, partial, duplicate, out-of-range and non-numeric responses are unknown, never low risk', () => {
  for (const input of [null, [], answers('0').slice(1), [...answers('0'), answers('0')[0]], answers('-1'), answers('4'), answers('NaN'), answers(''), [{ questionId: 'journal', value: 'Text' }]]) {
    assert.equal(evaluateSubmittedRisk(input), null);
  }
});

test('student cannot inject derived scores at creation/submission or edit responses after submission', async () => {
  const ids = await setup({ status: 'in_progress' }), db = client(ids.student), ref = doc(db, 'assessment_attempts', ids.attempt);
  for (const forged of [{ overallRiskScore: 0 }, { overallRiskLevel: 'low' }, { riskFlags: [] }, { score: 100 }, { feedback: 'forged' }]) {
    await assert.rejects(updateDoc(ref, { status: 'submitted', ...forged }), { code: 'permission-denied' });
    await assert.rejects(setDoc(doc(db, 'assessment_attempts', `${ids.assessment}_${ids.student}_1`), {
      studentId: ids.student, assessmentId: ids.assessment, status: 'in_progress', attemptNumber: 1, answers: [], ...forged,
    }), { code: 'permission-denied' });
  }
  await updateDoc(ref, { status: 'submitted', answers: answers('3') });
  await assert.rejects(updateDoc(ref, { answers: answers('0') }), { code: 'permission-denied' });
});

test('facilitator ignores forged legacy low-risk metadata, creates one alert and preserves resolution', async () => {
  const ids = await setup({ overallRiskLevel: 'low', overallRiskScore: 0, riskFlags: [] });
  globalThis.__sparkRiskDb = client(ids.fac);
  const [first, concurrent] = await Promise.all([
    riskAlertService.getOpenAlerts(ids.fac, 'facilitator'), riskAlertService.getOpenAlerts(ids.fac, 'facilitator'),
  ]);
  assert.equal(first.length, 1); assert.equal(concurrent.length, 1);
  assert.equal(first[0].severity, 'high'); assert.equal(first[0].overallRiskScore, 40);
  assert.equal((await admin.collection('risk_alerts').where('assessmentAttemptId', '==', ids.attempt).get()).size, 1);
  await riskAlertService.resolveAlert(first[0].id, 'facilitator');
  assert.equal((await riskAlertService.getOpenAlerts(ids.fac, 'facilitator')).length, 0);
  assert.equal((await riskAlertService.getAlertsForFacilitator(ids.fac, 'facilitator'))[0].status, 'resolved');
});

test('incomplete responses create a review alert without inventing a numeric score', async () => {
  const ids = await setup({ answers: answers('0').slice(1), overallRiskScore: 0 });
  globalThis.__sparkRiskDb = client(ids.fac);
  const alerts = await riskAlertService.getOpenAlerts(ids.fac, 'facilitator');
  assert.equal(alerts.length, 1); assert.equal(alerts[0].title, 'Assessment requires review');
  assert.equal(alerts[0].overallRiskScore, undefined);
});

test('another facilitator cannot inspect assigned responses and a student cannot impersonate staff', async () => {
  const ids = await setup();
  globalThis.__sparkRiskDb = client(ids.other);
  assert.deepEqual(await riskAlertService.getOpenAlerts(ids.other, 'facilitator'), []);
  await assert.rejects(riskAlertService.getOpenAlerts(ids.fac, 'facilitator'), { code: 'permission-denied' });
  globalThis.__sparkRiskDb = client(ids.student);
  await assert.rejects(riskAlertService.getOpenAlerts(ids.fac, 'facilitator'), { code: 'permission-denied' });
});

test('the real student submission service saves answers without derived metadata and remains idempotent', async () => {
  const studentSource = (await readFile(new URL('../../../packages/shared-services/src/services/assessment.service.ts', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\r?\n/gm, '');
  const doubles = `
export const fixture = { writes: [], notifications: [], attempt: { studentId: 'student', assessmentId: 'definition', status: 'in_progress' } };
const serverTimestamp = () => 'server-time';
const assessmentAttemptRepository = { update: async (id, data) => { fixture.writes.push({ id, data }); fixture.attempt.status = data.status; } };
const notificationService = { createInAppNotification: async data => { fixture.notifications.push(data); } };
`;
  const student = await import(moduleUrl(transpile(doubles + studentSource)));
  student.assessmentService.getAttempt = async () => student.fixture.attempt;
  student.assessmentService.getAssessmentDefinition = async () => ({ facilitatorId: 'facilitator', title: 'Assessment' });
  await student.assessmentService.submitAttempt('attempt', answers('3'));
  assert.equal(student.fixture.writes.length, 1);
  assert.deepEqual(Object.keys(student.fixture.writes[0].data).sort(), ['answers', 'status', 'submittedAt']);
  assert.equal(student.fixture.writes[0].data.status, 'submitted');
  assert.equal(student.fixture.notifications.length, 1);
  await student.assessmentService.submitAttempt('attempt', answers('3'));
  assert.equal(student.fixture.writes.length, 1);
});
