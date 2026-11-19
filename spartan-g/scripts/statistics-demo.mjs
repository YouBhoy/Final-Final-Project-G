/** Isolated emulator-only demo. Never reads or writes the live Firebase project. */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createServer } from 'vite';

const projectId = 'demo-spartan-statistics';
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env[name] ?? '')) throw new Error('This demo requires local Auth and Firestore emulators.');
}
if (process.env.GCLOUD_PROJECT !== projectId) throw new Error('Refusing to seed a project other than demo-spartan-statistics.');
initializeApp({ projectId });
const db = getFirestore(), auth = getAuth();
const admin = { uid: 'statistics-demo-admin', email: 'admin@statistics-demo.example', password: 'StatisticsDemo123!', displayName: 'Statistics Demo Admin' };
try { await auth.createUser(admin); } catch (cause) { if (cause.code !== 'auth/uid-already-exists' && cause.code !== 'auth/email-already-exists') throw cause; }
const local = new Date(Date.now() + 8 * 3600000), year = local.getUTCFullYear(), month = local.getUTCMonth(), today = local.getUTCDate();
const date = day => new Date(Date.UTC(year, month, Math.min(day, today), -8));
const registered = new Date(Date.UTC(year, month - 1, 1));
const batch = db.batch();
batch.set(db.doc(`users/${admin.uid}`), { uid: admin.uid, email: admin.email, displayName: admin.displayName, role: 'super_admin', isActive: true, campus: 'lipa', createdAt: registered });
const campuses = [{ key: 'lipa', label: 'Lipa Campus', students: 10 }, { key: 'alangilan', label: 'Alangilan', students: 8 }, { key: 'pablo_borbon', label: 'Pablo Borbon', students: 3 }, { key: 'arasof_nasugbu', label: 'ARASOF-Nasugbu', students: 0 }, { key: 'jplpc_malvar', label: 'JPLPC-Malvar', students: 0 }];
const definitionId = 'demo-standard-assessment';
const questionIds = [['phq', 9], ['gad', 7], ['dass', 21]].flatMap(([prefix, count]) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`));
batch.set(db.doc(`assessments/${definitionId}`), { title: 'Demo student assessment', courseId: 'demo-guidance', analyticsScoringVersion: 'standard-v1', isPublished: false, questions: questionIds.map((id, order) => ({ id, order, type: 'multiple_choice', options: ['0', '1', '2', '3'].map(id => ({ id, label: id })) })) });
for (const [order, campus] of campuses.entries()) {
  batch.set(db.doc(`campuses/${campus.key}`), { key: campus.key, label: campus.label, location: 'Synthetic demo', isActive: true, sortOrder: order });
  const facilitatorIds = Array.from({ length: 5 }, (_, index) => `demo-fac-${campus.key}-${index}`);
  facilitatorIds.forEach((fac, index) => batch.set(db.doc(`users/${fac}`), {
    uid: fac, role: 'facilitator', isActive: true, campus: campus.key,
    displayName: `Demo facilitator ${index + 1}`, createdAt: registered,
  }));
  for (let i = 0; i < campus.students; i++) {
    const fac = facilitatorIds[i % facilitatorIds.length];
    const uid = `demo-student-${campus.key}-${i}`;
    batch.set(db.doc(`users/${uid}`), { uid, role: 'student', isActive: true, campus: campus.key, displayName: `Synthetic student ${i + 1}`, createdAt: registered });
    const conversationId = `${fac}_${uid}`;
    batch.set(db.doc(`facilitator_student_links/${conversationId}`), { facilitatorId: fac, studentId: uid, status: 'accepted', requestedAt: registered, respondedAt: registered });
    batch.set(db.doc(`conversations/${conversationId}`), { participantIds: [uid, fac], lastMessageAt: date(6), lastMessagePreview: 'Synthetic demo' });
    if (i % 2 === 0) batch.set(db.doc(`appointments/demo-${uid}`), { studentId: uid, facilitatorId: fac, campus: campus.key, createdAt: date(2 + i), scheduledAt: date(2 + i), status: 'requested' });
    if (i % 3 === 0) batch.set(db.doc(`messages/demo-${uid}`), { conversationId, senderId: uid, createdAt: date(3 + i), body: 'Synthetic demo message', type: 'text' });
    batch.set(db.doc(`assessment_attempts/${definitionId}_${uid}_1`), { studentId: uid, assessmentId: definitionId, attemptNumber: 1, campus: campus.key, status: 'submitted', startedAt: date(2), submittedAt: date(4 + i), answers: questionIds.map(questionId => ({ questionId, value: i < 5 ? '0' : '1' })) });
  }

  const todayUtc = new Date(Date.UTC(year, month, today));
  const thisMonday = new Date(todayUtc);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - ((thisMonday.getUTCDay() + 6) % 7));
  const baseCounts = [1, 2, 4, 1, 3];
  const campusCount = Math.max(0, baseCounts[order] ?? 2);
  for (let weekIndex = 0; weekIndex < 16; weekIndex++) {
    const weekStart = new Date(thisMonday);
    weekStart.setUTCDate(weekStart.getUTCDate() - (16 - weekIndex) * 7);
    const requests = weekIndex % 5 === 0 ? 0 : campusCount + (weekIndex % 3);
    for (let requestIndex = 0; requestIndex < requests; requestIndex++) {
      const fac = facilitatorIds[(weekIndex + requestIndex) % facilitatorIds.length];
      batch.set(db.doc(`appointments/demo-staffing-${campus.key}-${weekIndex}-${requestIndex}`), {
        studentId: `demo-student-${campus.key}-${requestIndex % Math.max(campus.students, 1)}`,
        facilitatorId: fac,
        campus: campus.key,
        createdAt: new Date(weekStart.getTime() + 8 * 3600000 + requestIndex * 3600000),
        scheduledAt: new Date(weekStart.getTime() + 8 * 3600000 + 86400000),
        status: 'requested',
        syntheticSeed: 'synthetic-analytics-demo-2026',
      });
    }
  }

  const periodStart = new Date(Date.UTC(year, month, 1));
  const monthlyRequests = 5 + campusCount * 4;
  const availabilitySlots = facilitatorIds.length * 2;
  const ratio = monthlyRequests / availabilitySlots;
  batch.set(db.doc(`analytics/facilitatorWorkload/records/${campus.key}_monthly_${periodStart.toISOString().slice(0, 10)}`), {
    campusKey: campus.key,
    campusLabel: campus.label,
    periodStartDate: periodStart.toISOString().slice(0, 10),
    interval: 'monthly',
    locked: true,
    isComplete: true,
    dataPhase: 'development',
    cutoffVersion: 'synthetic-workload-demo-v1',
    cutoffStatus: 'synthetic-demo',
    aggregationVersion: '1',
    computedAt: new Date(),
    facilitatorCount: { value: 5, suppressed: false, display: '5' },
    activeAvailabilitySlots: { value: availabilitySlots, suppressed: false, display: String(availabilitySlots) },
    monthlyRequests: { value: monthlyRequests, suppressed: false, display: String(monthlyRequests) },
    capacityBand: ratio <= 2 ? 'Limited' : ratio <= 5 ? 'Moderate' : 'Adequate',
  });
}
await batch.commit();

// Override environment in this process only; do not change the user's .env files.
Object.assign(process.env, { VITE_FIREBASE_API_KEY: 'demo-statistics-local', VITE_FIREBASE_PROJECT_ID: projectId,
  VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`, VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456', VITE_FIREBASE_APP_ID: '1:123456:web:statistics-demo',
  VITE_APP_ENV: 'development', VITE_FIREBASE_USE_EMULATORS: 'true' });
const server = await createServer({ root: 'apps/web', server: { host: '127.0.0.1', port: 5180, strictPort: true } });
await server.listen();
console.log('Statistics demo: http://127.0.0.1:5180/admin/statistics');
console.log(`Local demo login: ${admin.email} / ${admin.password}`);
console.log('Synthetic data only. Stop with Ctrl+C; your normal website configuration is unchanged.');
await new Promise(resolve => {
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, resolve);
});
await server.close();
