import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { requireSuperAdmin, writeAuditEntry } from './adminUserFunctions.js';

if (!admin.apps.length) admin.initializeApp();

const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 10;
const MAX_REASON_LENGTH = 500;
const ALLOWED_KEYS = ['action', 'studentId', 'assessmentId', 'maxAttempts', 'reason'];
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Handler for superAdminOverrideAttempts, exported so the emulator tests can call it.
 *
 * Writes `assessment_overrides/{assessmentId}_{studentId}` in the same shape the
 * mobile app reads: assessmentId, studentId, maxAttemptsOverride (1-10),
 * grantedBy, grantedAt, reason. Clients can never write that collection.
 */
export async function handleSuperAdminOverrideAttempts(request: Pick<CallableRequest, 'auth' | 'data'>) {
  const caller = await requireSuperAdmin(request);
  const data = (request.data ?? {}) as Record<string, unknown>;

  const unexpected = Object.keys(data).filter((key) => !ALLOWED_KEYS.includes(key));
  if (unexpected.length > 0) {
    throw new HttpsError('invalid-argument', `Unsupported fields: ${unexpected.join(', ')}.`);
  }

  const { action, studentId, assessmentId } = data;
  if (action !== 'set' && action !== 'remove') {
    throw new HttpsError('invalid-argument', 'Action must be "set" or "remove".');
  }
  if (typeof studentId !== 'string' || !ID_PATTERN.test(studentId)) {
    throw new HttpsError('invalid-argument', 'A valid student id is required.');
  }
  if (typeof assessmentId !== 'string' || !ID_PATTERN.test(assessmentId)) {
    throw new HttpsError('invalid-argument', 'A valid assessment id is required.');
  }

  let maxAttempts = 0;
  let reason = '';
  if (action === 'set') {
    maxAttempts = data.maxAttempts as number;
    if (!Number.isInteger(maxAttempts) || maxAttempts < MIN_ATTEMPTS || maxAttempts > MAX_ATTEMPTS) {
      throw new HttpsError('invalid-argument', `Attempts must be a whole number from ${MIN_ATTEMPTS} to ${MAX_ATTEMPTS}.`);
    }
  }
  if (data.reason !== undefined && typeof data.reason !== 'string') {
    throw new HttpsError('invalid-argument', 'Reason must be text.');
  }
  reason = ((data.reason as string | undefined) ?? '').trim();
  if (!reason) throw new HttpsError('invalid-argument', 'A reason is required.');
  if (reason.length > MAX_REASON_LENGTH) {
    throw new HttpsError('invalid-argument', `Reason must be at most ${MAX_REASON_LENGTH} characters.`);
  }

  const db = admin.firestore();
  const [studentSnap, assessmentSnap] = await Promise.all([
    db.doc(`users/${studentId}`).get(),
    db.doc(`assessments/${assessmentId}`).get(),
  ]);
  if (!studentSnap.exists || studentSnap.data()?.role !== 'student') {
    throw new HttpsError('failed-precondition', 'The target must be an existing student.');
  }
  if (!assessmentSnap.exists) throw new HttpsError('failed-precondition', 'Assessment not found.');

  const defaultMax = assessmentSnap.data()?.maxAttempts;
  const overrideRef = db.doc(`assessment_overrides/${assessmentId}_${studentId}`);
  const existingSnap = await overrideRef.get();
  const previous = existingSnap.exists ? existingSnap.data()?.maxAttemptsOverride ?? null : null;

  if (action === 'remove') {
    if (!existingSnap.exists) throw new HttpsError('failed-precondition', 'There is no override to remove.');
    await overrideRef.delete();
    await writeAuditEntry({
      actorId: caller.uid,
      actorEmail: caller.email,
      action: 'SUPERADMIN_REMOVED_ASSESSMENT_OVERRIDE',
      resource: 'assessment_overrides',
      resourceId: overrideRef.id,
      metadata: { targetUserId: studentId, targetUserRole: 'student', assessmentId, previousValue: previous,
        newValue: null, defaultMaxAttempts: defaultMax ?? null, reason },
    });
    return { ok: true, changed: true, previousValue: previous, newValue: null };
  }

  // Attempts already used count the same way the apps count them: submitted or graded only.
  const used = (await db.collection('assessment_attempts')
    .where('assessmentId', '==', assessmentId)
    .where('studentId', '==', studentId)
    .where('status', 'in', ['submitted', 'graded'])
    .count().get()).data().count;
  if (maxAttempts < used) {
    throw new HttpsError('invalid-argument', `The student has already used ${used} attempt${used === 1 ? '' : 's'}; the new limit must be at least ${used}.`);
  }
  if (previous === maxAttempts && existingSnap.data()?.reason === reason) {
    return { ok: true, changed: false, previousValue: previous, newValue: maxAttempts };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await overrideRef.set({
    assessmentId,
    studentId,
    maxAttemptsOverride: maxAttempts,
    grantedBy: caller.uid,
    grantedAt: now,
    reason,
    ...(existingSnap.exists ? {} : { createdAt: now }),
    updatedAt: now,
  }, { merge: true });

  await writeAuditEntry({
    actorId: caller.uid,
    actorEmail: caller.email,
    action: 'SUPERADMIN_SET_ASSESSMENT_OVERRIDE',
    resource: 'assessment_overrides',
    resourceId: overrideRef.id,
    metadata: { targetUserId: studentId, targetUserRole: 'student', assessmentId, previousValue: previous,
      newValue: maxAttempts, defaultMaxAttempts: defaultMax ?? null, attemptsUsed: used, reason },
  });
  return { ok: true, changed: true, previousValue: previous, newValue: maxAttempts };
}

/**
 * superAdminOverrideAttempts — set or remove a student's attempt-limit override.
 * Callable (not a client write) so the caller role, target role, bounds and reason
 * are enforced server-side and every change is audited.
 */
export const superAdminOverrideAttempts = onCall(
  { region: 'us-central1', cors: true },
  (request) => handleSuperAdminOverrideAttempts(request),
);
