/**
 * Smoke test: run the REAL web code path against the emulator.
 *
 * It starts Vite for apps/web and loads `@spartan-g/shared-services` through Vite's own module
 * pipeline — the same resolution and TypeScript transform the browser build uses — then calls
 * assessmentService.startAttempt. A missing import, an undefined identifier or a stale/broken
 * module therefore fails here, which `tsc` and the rules tests cannot show.
 *
 * Safety: the web app's .env points at the real Firebase project. This test overrides every
 * Firebase variable with demo values and refuses to run unless it ends up on a demo project
 * connected to the emulator.
 *
 * Run (see package.json "test:smoke"):
 *   firebase emulators:exec --only firestore --project demo-web-smoke --config firebase.smoke-test.json "npm --prefix firebase/functions run test:smoke"
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulatorHost) throw new Error('Smoke test requires the Firestore emulator; never run against live data.');
const [host, port] = emulatorHost.split(':');

// Force a demo project BEFORE shared-services reads its configuration.
const PROJECT = 'demo-web-smoke';
Object.assign(process.env, {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: PROJECT,
  VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT}.appspot.com`,
  VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
  VITE_FIREBASE_APP_ID: '1:0:web:0',
  VITE_FIREBASE_MEASUREMENT_ID: 'G-DEMO',
  VITE_FIREBASE_VAPID_KEY: 'demo-vapid',
  VITE_FIREBASE_USE_EMULATORS: 'false',
  VITE_APP_ENV: 'development',
});
delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

initializeApp({ projectId: PROJECT });
const admin = getFirestore();

const repoRequire = createRequire(new URL('../../../package.json', import.meta.url));
const { createServer } = repoRequire('vite');
const webRoot = fileURLToPath(new URL('../../../apps/web/', import.meta.url));

let server;
let shared;
before(async () => {
  server = await createServer({
    root: webRoot,
    configFile: fileURLToPath(new URL('../../../apps/web/vite.config.ts', import.meta.url)),
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
  });
  shared = await server.ssrLoadModule('@spartan-g/shared-services');
  assert.equal(shared.env.firebase.projectId, PROJECT, 'must be on the demo project, not the real one');

  // Point the client SDK at the emulator before anything uses it.
  const firestoreSdk = await server.ssrLoadModule('firebase/firestore');
  const db = firestoreSdk.getFirestore(shared.getFirebaseApp());
  firestoreSdk.connectFirestoreEmulator(db, host, Number(port));
});
after(async () => {
  await server?.close();
});

let sequence = 0;
/** `campus: null` omits the field, like an account created before campuses were required. */
async function setup({ maxAttempts = 2, campus = 'lipa' } = {}) {
  const id = `smoke_${Date.now()}_${++sequence}`;
  const ids = { a: `${id}_a`, student: `${id}_s` };
  await Promise.all([
    admin.doc(`users/${ids.student}`).set({ role: 'student', isActive: true, ...(campus === null ? {} : { campus }) }),
    admin.doc(`assessments/${ids.a}`).set({ courseId: 'c1', title: 'PHQ', maxAttempts, questions: [] }),
  ]);
  return ids;
}
const seed = (ids, n, status, docId = `${ids.a}_${ids.student}_${n}`) => admin.doc(`assessment_attempts/${docId}`)
  .set({ assessmentId: ids.a, studentId: ids.student, status, attemptNumber: n, answers: [], startedAt: Timestamp.now() });
const finish = (ids, n) => admin.doc(`assessment_attempts/${ids.a}_${ids.student}_${n}`).update({ status: 'submitted' });
const start = ids => shared.assessmentService.startAttempt(ids.a, ids.student);

test('the web import path exposes the services and the shared helpers', async () => {
  assert.equal(typeof shared.assessmentService.startAttempt, 'function');
  assert.equal(typeof shared.assessmentOverrideService.getEffectiveMaxAttempts, 'function');
  const types = await server.ssrLoadModule('@spartan-g/shared-types');
  assert.equal(types.ATTEMPT_RULE_PREDECESSOR, 'strict', 'the deployed rule is the strict one');
  assert.equal(typeof types.planNextAttempt, 'function');
});

test('the wizard page and its imports compile and load through Vite', async () => {
  const page = await server.ssrLoadModule('/src/pages/assessment/AssessmentWizardPage.tsx');
  assert.equal(typeof page.AssessmentWizardPage, 'function');
});

test('startAttempt: first attempt, then the next one after it is submitted', async () => {
  const ids = await setup({ maxAttempts: 3 });
  const first = await start(ids);
  assert.equal(first, `${ids.a}_${ids.student}_1`);
  const doc = (await admin.doc(`assessment_attempts/${first}`).get()).data();
  assert.deepEqual([doc.attemptNumber, doc.status, doc.studentId], [1, 'in_progress', ids.student]);
  assert.equal(await start(ids), first, 'an unfinished attempt is resumed, not duplicated');
  await finish(ids, 1);
  assert.equal(await start(ids), `${ids.a}_${ids.student}_2`);
});

test('startAttempt: the limit shows the friendly message, and an override lifts it', async () => {
  const ids = await setup({ maxAttempts: 2 });
  await seed(ids, 1, 'submitted');
  await seed(ids, 2, 'graded');
  await assert.rejects(start(ids), err => err.code === 'assessment/attempt-limit'
    && err.message === 'You have used all 2 attempts. Ask your administrator for an override.');
  await admin.doc(`assessment_overrides/${ids.a}_${ids.student}`).set({
    assessmentId: ids.a, studentId: ids.student, maxAttemptsOverride: 3, grantedBy: 'admin', grantedAt: Timestamp.now(), reason: 'test' });
  assert.equal(await start(ids), `${ids.a}_${ids.student}_3`);
});

test('startAttempt: a legacy attempt under another id is reported as a broken chain (strict rule)', async () => {
  const ids = await setup({ maxAttempts: 10 });
  await seed(ids, 1, 'submitted');
  await seed(ids, 2, 'submitted');
  await seed(ids, 3, 'submitted', 'legacy-random-id');
  await assert.rejects(start(ids), err => err.code === 'assessment/attempt-chain-broken'
    && /out of sequence/.test(err.message));
  assert.equal((await admin.doc(`assessment_attempts/${ids.a}_${ids.student}_4`).get()).exists, false, 'nothing was written');
});

test('startAttempt: highest + 1 avoids the id that count + 1 would have collided with', async () => {
  const ids = await setup({ maxAttempts: 10 });
  for (const n of [1, 2, 3, 5]) await seed(ids, n, 'submitted'); // gap: no attempt 4
  assert.equal(await start(ids), `${ids.a}_${ids.student}_6`);
});

// ─── Students whose records are incomplete (the "invalid-argument" failure) ──
test('startAttempt: a student with no campus on their user record can still start (no undefined field is written)', async () => {
  const ids = await setup({ campus: null });
  const attemptId = await start(ids);
  assert.equal(attemptId, `${ids.a}_${ids.student}_1`);
  const data = (await admin.doc(`assessment_attempts/${attemptId}`).get()).data();
  assert.equal('campus' in data, false, 'campus is omitted, not stored as undefined');
  assert.deepEqual([data.attemptNumber, data.status], [1, 'in_progress']);
});

test('startAttempt: no-campus student with a finished attempt moves on to the next one', async () => {
  const ids = await setup({ campus: null, maxAttempts: 3 });
  await seed(ids, 1, 'submitted');
  assert.equal(await start(ids), `${ids.a}_${ids.student}_2`);
});

test('startAttempt: an in-progress attempt is resumed even when the user record has no campus', async () => {
  const ids = await setup({ campus: null });
  await seed(ids, 1, 'in_progress');
  assert.equal(await start(ids), `${ids.a}_${ids.student}_1`);
  assert.equal((await admin.collection('assessment_attempts').where('studentId', '==', ids.student).get()).size, 1);
});

test('startAttempt: an old attempt under a random id gives the friendly chain message, not invalid-argument', async () => {
  const ids = await setup({ campus: null, maxAttempts: 5 });
  await seed(ids, 1, 'submitted', 'old-random-attempt-id');
  await assert.rejects(start(ids), err => err.code === 'assessment/attempt-chain-broken');
});

test('startAttempt: empty or malformed ids fail with a clear message before touching Firestore', async () => {
  const ids = await setup();
  for (const [a, st] of [['', ids.student], [ids.a, ''], ['a/b', ids.student], [ids.a, 's/t']]) {
    await assert.rejects(shared.assessmentService.startAttempt(a, st), err => err.code === 'assessment/invalid-reference', `${a}|${st}`);
  }
});
