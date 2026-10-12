import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/** Only an actual student booking can grant the named facilitator access. */
export async function acceptBookedAppointment(db: Firestore, uid: string, appointmentId: unknown) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (typeof appointmentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(appointmentId)) {
    throw new HttpsError('invalid-argument', 'A valid appointment id is required.');
  }
  return db.runTransaction(async tx => {
    const caller = (await tx.get(db.doc(`users/${uid}`))).data();
    if (caller?.isActive !== true || !['facilitator', 'super_admin'].includes(caller.role)) {
      throw new HttpsError('permission-denied', 'Only active staff may accept appointments.');
    }
    const ref = db.doc(`appointments/${appointmentId}`);
    const appointment = (await tx.get(ref)).data();
    if (!appointment || (caller.role !== 'super_admin' && appointment.facilitatorId !== uid)) {
      throw new HttpsError('permission-denied', 'Appointment is not assigned to you.');
    }
    const { studentId, facilitatorId } = appointment;
    if ([studentId, facilitatorId].some(id => typeof id !== 'string' || !id || id.includes('/'))) {
      throw new HttpsError('failed-precondition', 'Invalid appointment participants.');
    }
    const student = (await tx.get(db.doc(`users/${studentId}`))).data();
    const facilitator = (await tx.get(db.doc(`users/${facilitatorId}`))).data();
    if (student?.role !== 'student' || student.isActive !== true
      || facilitator?.role !== 'facilitator' || facilitator.isActive !== true) {
      throw new HttpsError('failed-precondition', 'Appointment participants must be active.');
    }
    // Retries must not restore a relationship an administrator has revoked.
    if (appointment.status === 'accepted') return { appointmentId };
    if (appointment.status !== 'requested') {
      throw new HttpsError('failed-precondition', 'Appointment is not awaiting acceptance.');
    }
    const linkRef = db.doc(`facilitator_student_links/${facilitatorId}_${studentId}`);
    const link = (await tx.get(linkRef)).data();
    if (link && (link.facilitatorId !== facilitatorId || link.studentId !== studentId)) {
      throw new HttpsError('failed-precondition', 'The relationship has inconsistent identities.');
    }
    const conversationRef = db.doc(`conversations/${[facilitatorId, studentId].sort().join('_')}`);
    const conversation = (await tx.get(conversationRef)).data();
    if (conversation && (!Array.isArray(conversation.participantIds)
      || conversation.participantIds.length !== 2
      || !conversation.participantIds.includes(facilitatorId) || !conversation.participantIds.includes(studentId))) {
      throw new HttpsError('failed-precondition', 'The conversation has inconsistent participants.');
    }
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { status: 'accepted', acceptedAt: now, updatedAt: now });
    tx.set(linkRef, { facilitatorId, studentId, status: 'accepted',
      requestedAt: link?.requestedAt ?? appointment.createdAt ?? now,
      createdAt: link?.createdAt ?? now, respondedAt: now, updatedAt: now });
    if (!conversation) tx.create(conversationRef, { participantIds: [facilitatorId, studentId],
      lastMessageAt: now, lastMessagePreview: '', unreadCount: {}, createdAt: now, updatedAt: now });
    tx.set(db.doc(`notifications/accepted_${appointmentId}`), { userId: studentId,
      title: 'Appointment Accepted', body: 'Your appointment has been accepted by the facilitator.',
      type: 'appointment', relatedId: appointmentId, data: { relatedId: appointmentId },
      isRead: false, createdAt: now, updatedAt: now });
    return { appointmentId };
  });
}
