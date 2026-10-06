import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

interface BookingInput {
  facilitatorId?: string;
  appointmentId?: string;
  scheduledAtMs: number;
  durationMinutes: number;
  notes?: string;
  notifyBeforeMinutes?: number;
}

// Shared by both callable functions and emulator integration tests.
export async function bookAppointment(db: Firestore, uid: string, input: BookingInput) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  if (!input || !Number.isFinite(input.scheduledAtMs)
    || !Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0
    || !Number.isSafeInteger(input.scheduledAtMs + input.durationMinutes * 60000)) {
    throw new HttpsError('invalid-argument', 'A valid appointment time and positive duration are required.');
  }
  if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 10000)) {
    throw new HttpsError('invalid-argument', 'Appointment notes must be text of at most 10000 characters.');
  }
  if (input.notifyBeforeMinutes !== undefined
    && (!Number.isInteger(input.notifyBeforeMinutes) || input.notifyBeforeMinutes < 0)) {
    throw new HttpsError('invalid-argument', 'Notification lead time must be a nonnegative integer.');
  }
  const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/');
  if (input.appointmentId !== undefined && !validId(input.appointmentId)) {
    throw new HttpsError('invalid-argument', 'Invalid appointment id.');
  }
  if (!input.appointmentId && !validId(input.facilitatorId)) {
    throw new HttpsError('invalid-argument', 'A facilitator is required.');
  }
  const appointmentRef = input.appointmentId
    ? db.collection('appointments').doc(input.appointmentId)
    : db.collection('appointments').doc();
  const notificationRef = db.collection('notifications').doc();
  await db.runTransaction(async (tx) => {
    if (input.scheduledAtMs <= Date.now()) {
      throw new HttpsError('invalid-argument', 'Cannot book appointments in the past');
    }
    const student = await tx.get(db.collection('users').doc(uid));
    if (student.data()?.role !== 'student' || student.data()?.isActive !== true) {
      throw new HttpsError('permission-denied', 'Only active students may book appointments.');
    }
    let facilitatorId = input.facilitatorId;
    if (input.appointmentId) {
      const existing = await tx.get(appointmentRef);
      if (!existing.exists) throw new HttpsError('not-found', 'Appointment not found');
      if (existing.data()?.studentId !== uid) throw new HttpsError('permission-denied', 'Not authorized');
      if (existing.data()?.status !== 'reschedule_requested') {
        throw new HttpsError('failed-precondition', 'Appointment is not awaiting a reschedule');
      }
      facilitatorId = existing.data()!.facilitatorId;
    }
    if (!validId(facilitatorId)) throw new HttpsError('invalid-argument', 'Invalid facilitator id.');
    const facilitator = await tx.get(db.collection('users').doc(facilitatorId));
    if (facilitator.data()?.role !== 'facilitator' || facilitator.data()?.isActive !== true) {
      throw new HttpsError('failed-precondition', 'Facilitator is unavailable.');
    }
    // Every booking/reschedule for this facilitator reads AND writes the same
    // document. Even an empty overlap query therefore cannot admit two winners.
    const lockRef = db.collection('appointment_booking_locks').doc(facilitatorId);
    await tx.get(lockRef);
    // Single-field query includes existing appointments without a migration or
    // composite index. Read failure aborts the transaction; never fail open.
    const existing = await tx.get(db.collection('appointments').where('facilitatorId', '==', facilitatorId));
    const end = input.scheduledAtMs + input.durationMinutes * 60000;
    for (const record of existing.docs) {
      const appointment = record.data();
      if (record.id === appointmentRef.id || !['requested', 'accepted'].includes(appointment.status)) continue;
      const start = appointment.scheduledAt?.toMillis?.();
      const duration = appointment.durationMinutes;
      if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
        throw new HttpsError('failed-precondition', 'An existing appointment has invalid scheduling data.');
      }
      if (input.scheduledAtMs < start + duration * 60000 && end > start) {
        throw new HttpsError('already-exists', 'This time slot is already booked. Please choose another time.');
      }
    }
    const now = FieldValue.serverTimestamp();
    tx.set(lockRef, { updatedAt: now });
    const schedule = { scheduledAt: Timestamp.fromMillis(input.scheduledAtMs), durationMinutes: input.durationMinutes,
      status: 'requested', updatedAt: now };
    if (input.appointmentId) {
      tx.update(appointmentRef, { ...schedule, rescheduleReason: FieldValue.delete(), rescheduleRequestedAt: FieldValue.delete() });
    } else {
      tx.create(appointmentRef, { ...schedule, studentId: uid, facilitatorId, createdAt: now,
        notifyBeforeMinutes: input.notifyBeforeMinutes ?? 30, ...(input.notes !== undefined ? { notes: input.notes } : {}) });
    }
    // Commit the notification with the booking, so a notification error cannot
    // make the client retry an appointment that was already successfully saved.
    tx.create(notificationRef, { userId: facilitatorId,
      title: input.appointmentId ? 'Appointment Rescheduled' : 'New Appointment Request',
      body: 'A student has requested an appointment.', type: 'appointment', isRead: false,
      data: { relatedId: appointmentRef.id }, relatedId: appointmentRef.id, created_at: now, updated_at: now });
  });
  return { appointmentId: appointmentRef.id };
}
