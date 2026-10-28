import { collection, deleteField, doc, runTransaction, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { BOOKING_WINDOW_MESSAGE, isWithinBookingWindow } from '@spartan-g/shared-types';
import { getFirebaseApp } from '../firebase/app';
import { getFirestoreDb } from '../firebase/firestore';

const HALF_HOUR = 30 * 60_000;

export interface ClientBookingInput {
  studentId: string;
  facilitatorId?: string;
  appointmentId?: string;
  scheduledAt: Date;
  durationMinutes: number;
  notes?: string;
  notifyBeforeMinutes?: number;
}

function actorUid() {
  const uid = getAuth(getFirebaseApp()).currentUser?.uid;
  if (!uid) throw new Error('Please sign in again.');
  return uid;
}

/** Rules require all four reservations, validate their ownership and reject live overlaps. */
export async function bookAppointmentClient(input: ClientBookingInput, db: Firestore = getFirestoreDb(), uid = actorUid()) {
  if (input.studentId !== uid) throw new Error('You can only book your own appointments.');
  const start = input.scheduledAt.getTime();
  if (!Number.isSafeInteger(start) || start % HALF_HOUR !== 0 || input.durationMinutes !== 60) {
    throw new Error('Choose a time on the hour or half hour. Appointments last 60 minutes.');
  }
  if (start <= Date.now()) throw new Error('Please choose a time later than the current time.');
  if (!isWithinBookingWindow(start, Date.now())) throw new Error(BOOKING_WINDOW_MESSAGE);
  if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 10000)) {
    throw new Error('Appointment notes must be at most 10000 characters.');
  }
  const ref = input.appointmentId ? doc(db, 'appointments', input.appointmentId) : doc(collection(db, 'appointments'));
  const notification = doc(collection(db, 'notifications'));
  try {
    await runTransaction(db, async tx => {
      const config = await tx.get(doc(db, 'appointment_booking_config', 'spark'));
      if (config.data()?.version !== 1) throw new Error('Appointment booking is being initialized. Please try again later.');
      const existing = input.appointmentId ? await tx.get(ref) : null;
      if (existing && (!existing.exists() || existing.data().studentId !== uid || existing.data().status !== 'reschedule_requested')) {
        throw new Error('This appointment is not awaiting your reschedule.');
      }
      // Capture the authoritative campus only for a new request. Transfers and
      // rescheduling must not rewrite the original referral's attribution.
      const student = !existing ? (await tx.get(doc(db, 'users', uid))).data() : undefined;
      const campus = typeof student?.campus === 'string' && student.campus.length > 0 ? student.campus : undefined;
      const facilitatorId = existing?.data()?.facilitatorId ?? input.facilitatorId;
      if (typeof facilitatorId !== 'string' || !facilitatorId || facilitatorId.includes('/')) throw new Error('Choose a valid facilitator.');
      const first = start / HALF_HOUR;
      const reservations = [
        { id: `f_${facilitatorId}_${first}`, slot: first, participantId: facilitatorId, kind: 'f' },
        { id: `f_${facilitatorId}_${first + 1}`, slot: first + 1, participantId: facilitatorId, kind: 'f' },
        { id: `s_${uid}_${first}`, slot: first, participantId: uid, kind: 's' },
        { id: `s_${uid}_${first + 1}`, slot: first + 1, participantId: uid, kind: 's' },
      ];
      // Reading each shared reservation makes concurrent transactions retry. Rules decide
      // whether an existing reservation has been released by cancellation or rescheduling.
      for (const item of reservations) await tx.get(doc(db, 'appointment_reservations', item.id));
      const now = serverTimestamp();
      // A new support request shares identity; rescheduling never overrides revocation.
      if (!existing) tx.set(doc(db, 'student_identity_consents', `${facilitatorId}_${uid}`), {
        studentId: uid, facilitatorId, requestedAt: now,
      });
      for (const item of reservations) {
        const { id, ...data } = item;
        tx.set(doc(db, 'appointment_reservations', id), { ...data, appointmentId: ref.id });
      }
      const schedule = { scheduledAt: Timestamp.fromMillis(start), durationMinutes: 60, status: 'requested', updatedAt: now };
      tx.set(doc(db, 'appointment_availability', ref.id), { facilitatorId, scheduledAt: schedule.scheduledAt, durationMinutes: 60, status: 'requested' });
      if (existing) {
        tx.update(ref, { ...schedule, rescheduleReason: deleteField(), rescheduleRequestedAt: deleteField() });
      } else {
        tx.set(ref, { ...schedule, studentId: uid, facilitatorId, createdAt: now,
          ...(campus !== undefined ? { campus } : {}),
          notifyBeforeMinutes: input.notifyBeforeMinutes ?? 30, ...(input.notes !== undefined ? { notes: input.notes } : {}) });
      }
      tx.set(notification, { userId: facilitatorId, title: existing ? 'Appointment Rescheduled' : 'New Appointment Request',
        body: 'A student has requested an appointment.', type: 'appointment', isRead: false,
        relatedId: ref.id, data: { relatedId: ref.id }, created_at: now, updated_at: now });
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'permission-denied') {
      throw new Error('The appointment could not be saved. This time may already be booked, or the account is no longer eligible. Please choose another time or sign in again.');
    }
    throw error;
  }
  return ref.id;
}

/** Acceptance, access grant, conversation and notification commit together. */
export async function acceptAppointmentClient(appointmentId: string, db: Firestore = getFirestoreDb(), uid = actorUid()) {
  return runTransaction(db, async tx => {
    const caller = (await tx.get(doc(db, 'users', uid))).data();
    const ref = doc(db, 'appointments', appointmentId);
    const snapshot = await tx.get(ref);
    const appointment = snapshot.data();
    if (!appointment || caller?.isActive !== true
      || (caller.role !== 'super_admin' && (caller.role !== 'facilitator' || appointment.facilitatorId !== uid))) {
      throw new Error('Appointment is not assigned to you.');
    }
    if (appointment.status === 'accepted') return { appointmentId };
    if (appointment.status !== 'requested') throw new Error('Appointment is not awaiting acceptance.');
    const { facilitatorId, studentId } = appointment;
    const linkRef = doc(db, 'facilitator_student_links', `${facilitatorId}_${studentId}`);
    const conversationRef = doc(db, 'conversations', [facilitatorId, studentId].sort().join('_'));
    const link = await tx.get(linkRef);
    const conversation = await tx.get(conversationRef);
    if (conversation.exists() && (conversation.data().participantIds?.length !== 2
      || !conversation.data().participantIds.includes(facilitatorId) || !conversation.data().participantIds.includes(studentId))) {
      throw new Error('The conversation has inconsistent participants. Please contact an administrator.');
    }
    const now = serverTimestamp();
    tx.update(ref, { status: 'accepted', acceptedAt: now, updatedAt: now });
    if (link.exists()) {
      tx.update(linkRef, { status: 'accepted', appointmentId, respondedAt: now, updatedAt: now });
    } else {
      tx.set(linkRef, { facilitatorId, studentId, status: 'accepted', appointmentId,
        requestedAt: appointment.createdAt ?? now, createdAt: now, respondedAt: now, updatedAt: now });
    }
    if (!conversation.exists()) tx.set(conversationRef, { participantIds: [facilitatorId, studentId],
      lastMessageAt: now, lastMessagePreview: '', unreadCount: {}, createdAt: now, updatedAt: now });
    tx.set(doc(db, 'appointment_availability', appointmentId), { facilitatorId, scheduledAt: appointment.scheduledAt, durationMinutes: appointment.durationMinutes, status: 'accepted' });
    tx.set(doc(db, 'notifications', `accepted_${appointmentId}`), { userId: studentId, title: 'Appointment Accepted',
      body: 'Your appointment has been accepted by the facilitator.', type: 'appointment', relatedId: appointmentId,
      data: { relatedId: appointmentId }, isRead: false, created_at: now, updated_at: now });
    return { appointmentId };
  });
}
