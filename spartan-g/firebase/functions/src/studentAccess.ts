import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';

export async function requireStudentAccess(db: Firestore, uid: string, studentId: unknown) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const caller = (await db.doc(`users/${uid}`).get()).data();
  if (caller?.isActive !== true || !['facilitator', 'super_admin'].includes(caller.role)) {
    throw new HttpsError('permission-denied', 'Staff access required.');
  }
  if (typeof studentId !== 'string' || !studentId || studentId.includes('/')) {
    throw new HttpsError('failed-precondition', 'The record has no valid student identity.');
  }
  if (caller.role === 'super_admin') return;
  const link = (await db.doc(`facilitator_student_links/${uid}_${studentId}`).get()).data();
  if (link?.status !== 'accepted' || link.facilitatorId !== uid || link.studentId !== studentId) {
    throw new HttpsError('permission-denied', 'This student is not assigned to you.');
  }
}
