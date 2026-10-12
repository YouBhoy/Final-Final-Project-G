import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { buildStatistics, validateFilters, type Data, type ReportInput } from './statisticsAggregation.js';

if (!getApps().length) initializeApp();
const MAX_RECORDS = 10000;
/** Bounded metadata reads. Fail explicitly instead of returning truncated statistics. */
async function read(db: Firestore, collection: string, fields: string[]): Promise<Data[]> {
  const snapshot = await db.collection(collection).select(...fields).limit(MAX_RECORDS + 1).get();
  if (snapshot.size > MAX_RECORDS) throw new HttpsError('resource-exhausted', 'This report exceeds the current reporting capacity. Ask the project administrator to enable indexed reporting.');
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
}
export async function generateAdminStatistics(db: Firestore, uid: string, filters: unknown) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = (await db.doc(`users/${uid}`).get()).data();
  if (caller?.role !== 'super_admin' || caller.isActive !== true) throw new HttpsError('permission-denied', 'Statistics requires an active super administrator.');
  let validated;
  try { validated = validateFilters(filters); }
  catch (cause) { throw new HttpsError('invalid-argument', cause instanceof Error ? cause.message : 'Invalid report filters.'); }
  const [users, campuses, appointments, messages, conversations, links, attempts, assessments] = await Promise.all([
    read(db, 'users', ['role', 'campus', 'createdAt', 'created_at']),
    read(db, 'campuses', ['key', 'label']),
    read(db, 'appointments', ['studentId', 'campus', 'createdAt', 'created_at']),
    read(db, 'messages', ['senderId', 'conversationId', 'campus', 'createdAt', 'created_at', 'type', 'status', 'isDeleted']),
    read(db, 'conversations', ['participantIds']),
    read(db, 'facilitator_student_links', ['facilitatorId', 'studentId', 'status', 'requestedAt', 'respondedAt']),
    read(db, 'assessment_attempts', ['studentId', 'assessmentId', 'campus', 'status', 'startedAt', 'started_at', 'createdAt', 'submittedAt', 'submitted_at', 'answers']),
    read(db, 'assessments', ['studentId', 'templateId', 'title', 'questions', 'analyticsScoringVersion', 'status', 'campus', 'submittedAt']),
  ]);
  const input: ReportInput = { users, campuses, appointments, messages, conversations, links, attempts,
    definitions: assessments.filter(a => !('studentId' in a)), legacyInstances: assessments.filter(a => 'studentId' in a) };
  // Check again after reads so disabling the caller during a report cancels delivery.
  const currentCaller = (await db.doc(`users/${uid}`).get()).data();
  if (currentCaller?.role !== 'super_admin' || currentCaller.isActive !== true) throw new HttpsError('permission-denied', 'Statistics access has changed.');
  return buildStatistics(input, validated);
}
export const getAdminStatistics = onCall({ region: 'us-central1', cors: true, timeoutSeconds: 120, memory: '512MiB', maxInstances: 3 }, request =>
  generateAdminStatistics(getFirestore(), request.auth?.uid ?? '', request.data),
);
