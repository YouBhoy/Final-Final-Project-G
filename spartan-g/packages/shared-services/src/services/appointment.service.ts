import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '../firebase/app';
import {
  PERMISSIONS,
  Role,
  AppointmentDocument,
  hasPermission,
  PermissionError,
  COLLECTIONS,
} from '@spartan-g/shared-types';
import {
  Timestamp,
  serverTimestamp,
  getFirestoreDb,
  doc,
  setDoc,
  runTransaction,
} from '../firebase/firestore';
import { appointmentRepository } from '../repositories/appointment.repository';
import { workHoursRepository } from '../repositories/work-hours.repository';
import { notificationRepository } from '../repositories/notification.repository';

export interface RequestAppointmentPayload {
  studentId: string;
  facilitatorId: string;
  scheduledAt: Date;
  durationMinutes: number;
  notes?: string;
  notifyBeforeMinutes?: number;
}

export interface CreateNotificationPayload {
  userId: string;
  title: string;
  body: string;
  type: 'appointment' | 'reschedule';
  relatedId?: string;
}

class AppointmentService {
  /**
   * Whether an appointment's scheduled end time (start + duration) has passed.
   * Used to let facilitators still resolve stale/past appointments that were
   * never completed, cancelled, or marked no-show.
   */
  private isPastAppointment(appointment: AppointmentDocument): boolean {
    const raw = appointment.scheduledAt as any;
    const startMs =
      typeof raw?.toDate === 'function' ? raw.toDate().getTime() : new Date(raw).getTime();
    if (Number.isNaN(startMs)) return false;
    const endMs = startMs + (appointment.durationMinutes || 0) * 60 * 1000;
    return endMs < Date.now();
  }

  /**
   * Create an in-app notification for the user.
   */
  private async createNotification(payload: CreateNotificationPayload) {
    const id = `notif_${payload.userId}_${Date.now()}`;
    await setDoc(doc(getFirestoreDb(), COLLECTIONS.NOTIFICATIONS, id), {
      userId: payload.userId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      isRead: false,
      data: payload.relatedId ? { relatedId: payload.relatedId } : {},
      relatedId: payload.relatedId,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  }

  async getAppointments(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }
    return appointmentRepository.getByFacilitator(facilitatorId);
  }

  async getStudentAppointments(studentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
      throw new PermissionError();
    }
    return appointmentRepository.getByStudent(studentId);
  }

  async getUpcoming(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }
    return appointmentRepository.getUpcomingByFacilitator(facilitatorId);
  }

  /** Booking is authorized and checked atomically by the backend. */
  async requestAppointment(payload: RequestAppointmentPayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) throw new PermissionError();
    const callable = httpsCallable<Record<string, unknown>, { appointmentId: string }>(
      getFunctions(getFirebaseApp()), 'requestAppointment',
    );
    const result = await callable({
      facilitatorId: payload.facilitatorId,
      scheduledAtMs: payload.scheduledAt.getTime(),
      durationMinutes: payload.durationMinutes,
      ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
      ...(payload.notifyBeforeMinutes !== undefined ? { notifyBeforeMinutes: payload.notifyBeforeMinutes } : {}),
    });
    return result.data.appointmentId;
  }

  /**
   * Accept an appointment with transactional consistency.
   * Creates link + conversation if needed.
   */
  async acceptAppointment(appointmentId: string, facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const db = getFirestoreDb();
    const appointmentRef = doc(db, COLLECTIONS.APPOINTMENTS, appointmentId);

    try {
      const result = await runTransaction(db, async (transaction) => {
        const appointmentDoc = await transaction.get(appointmentRef);
        if (!appointmentDoc.exists()) {
          throw new Error('Appointment not found');
        }

        const appointment = appointmentDoc.data() as AppointmentDocument;
        if (appointment.facilitatorId !== facilitatorId) {
          throw new Error('Not authorized');
        }
        if (appointment.status !== 'requested') {
          throw new Error('Appointment is not in requested status');
        }

        // Read the related records before performing any writes in the transaction.
        const linkId = `${facilitatorId}_${appointment.studentId}`;
        const linkRef = doc(db, COLLECTIONS.FACILITATOR_STUDENT_LINKS, linkId);
        const linkDoc = await transaction.get(linkRef);

        const convId = [facilitatorId, appointment.studentId].sort().join('_');
        const conversationRef = doc(db, COLLECTIONS.CONVERSATIONS, convId);
        const conversationDoc = await transaction.get(conversationRef);

        // 1. Update appointment status
        transaction.update(appointmentRef, {
          status: 'accepted',
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 2. Create or update facilitator_student_link
        if (!linkDoc.exists()) {
          transaction.set(linkRef, {
            facilitatorId,
            studentId: appointment.studentId,
            status: 'accepted',
            requestedAt: serverTimestamp(),
            respondedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (linkDoc.data()?.status !== 'accepted') {
          transaction.update(linkRef, {
            status: 'accepted',
            respondedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // 3. Ensure conversation exists with required messaging fields.
        if (!conversationDoc.exists()) {
          transaction.set(conversationRef, {
            participantIds: [facilitatorId, appointment.studentId],
            lastMessageAt: serverTimestamp(),
            lastMessagePreview: '',
            unreadCount: {},
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        return appointment.studentId;
      });

      // Notify the student
      await this.createNotification({
        userId: result,
        title: 'Appointment Accepted',
        body: 'Your appointment has been accepted by the facilitator.',
        type: 'appointment',
        relatedId: appointmentId,
      });

      return { appointmentId };
    } catch (error: any) {
      throw new Error(error.message || 'Failed to accept appointment');
    }
  }

  /**
   * Instead of rejecting, request a reschedule from the student.
   * The appointment status changes to 'reschedule_requested', which
   * prompts the student to pick a new time.
   */
  async requestReschedule(
    appointmentId: string,
    facilitatorId: string,
    reason: string,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const appointment = await appointmentRepository.getById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');
    if (appointment.facilitatorId !== facilitatorId) throw new Error('Not authorized');
    // Normally only requested appointments can be rescheduled, but a past one that
    // was never actioned (or a resolved/terminal one being re-opened) should also
    // be reschedulable to a future slot.
    const isTerminalStatus = ['completed', 'cancelled', 'rejected', 'no_show'].includes(appointment.status);
    if (appointment.status !== 'requested' && !isTerminalStatus && !this.isPastAppointment(appointment)) {
      throw new Error('Appointment is not in requested status');
    }

    await appointmentRepository.update(appointmentId, {
      status: 'reschedule_requested',
      rescheduleReason: reason,
      rescheduleRequestedAt: serverTimestamp() as any,
    } as Partial<AppointmentDocument>);

    // Notify the student to reschedule
    await this.createNotification({
      userId: appointment.studentId,
      title: 'Reschedule Requested',
      body: reason 
        ? `The facilitator has requested a reschedule: "${reason}"` 
        : 'The facilitator has requested that you reschedule your appointment.',
      type: 'reschedule',
      relatedId: appointmentId,
    });

    return appointmentId;
  }

  /** Rescheduling uses the same serialized backend overlap check as booking. */
  async rescheduleAppointment(
    appointmentId: string,
    studentId: string,
    newScheduledAt: Date,
    newDurationMinutes: number,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) throw new PermissionError();
    const callable = httpsCallable<Record<string, unknown>, { appointmentId: string }>(
      getFunctions(getFirebaseApp()), 'rescheduleAppointment',
    );
    const result = await callable({ appointmentId, scheduledAtMs: newScheduledAt.getTime(),
      durationMinutes: newDurationMinutes });
    return result.data.appointmentId;
  }

  async completeAppointment(
    appointmentId: string,
    facilitatorId: string,
    outcomeNotes: string,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const appointment = await appointmentRepository.getById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');
    if (appointment.facilitatorId !== facilitatorId) throw new Error('Not authorized');
    // Allow completing past appointments that were never actioned (stale requests),
    // in addition to normally accepted ones.
    if (appointment.status !== 'accepted' && !this.isPastAppointment(appointment)) {
      throw new Error('Appointment must be accepted first');
    }

    await appointmentRepository.update(appointmentId, {
      status: 'completed',
      outcomeNotes,
      completedAt: serverTimestamp() as any,
    } as Partial<AppointmentDocument>);

    // Notify student
    await this.createNotification({
      userId: appointment.studentId,
      title: 'Appointment Completed',
      body: 'Your appointment has been marked as completed.',
      type: 'appointment',
      relatedId: appointmentId,
    });

    return appointmentId;
  }

  async cancelAppointment(
    appointmentId: string,
    actorRole: Role,
    userId: string,
    reason?: string,
  ) {
    const appointment = await appointmentRepository.getById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');

    const isStudent = hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)
      && !hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS);
    const isFacilitator = hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS);

    if (!isStudent && !isFacilitator) {
      throw new PermissionError();
    }

    if (isStudent) {
      if (appointment.studentId !== userId) throw new Error('Not authorized');
      if (appointment.status !== 'requested') throw new Error('Can only cancel pending appointments');
    }

    if (isFacilitator && appointment.facilitatorId !== userId) {
      throw new Error('Not authorized');
    }

    const cancellationReason = reason || (isStudent ? 'Cancelled by student' : 'Cancelled by facilitator');
    await appointmentRepository.update(appointmentId, {
      status: 'cancelled',
      cancellationReason,
    } as Partial<AppointmentDocument>);

    // Notify the other party
    const notifyUserId = isStudent ? appointment.facilitatorId : appointment.studentId;
    await this.createNotification({
      userId: notifyUserId,
      title: 'Appointment Cancelled',
      body: cancellationReason,
      type: 'appointment',
      relatedId: appointmentId,
    });

    return appointmentId;
  }

  async markNoShow(appointmentId: string, facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const appointment = await appointmentRepository.getById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');
    if (appointment.facilitatorId !== facilitatorId) throw new Error('Not authorized');
    // Allow no-showing past appointments that were never actioned, in addition
    // to normally accepted ones.
    if (appointment.status !== 'accepted' && !this.isPastAppointment(appointment)) {
      throw new Error('Appointment must be accepted first');
    }

    await appointmentRepository.update(appointmentId, {
      status: 'no_show',
      completedAt: serverTimestamp() as any,
    } as Partial<AppointmentDocument>);

    await this.createNotification({
      userId: appointment.studentId,
      title: 'Marked as No Show',
      body: 'You were marked as a no-show for your appointment.',
      type: 'appointment',
      relatedId: appointmentId,
    });

    return appointmentId;
  }

  /**
   * Save facilitator notes for an appointment.
   */
  async saveFacilitatorNotes(
    appointmentId: string,
    facilitatorId: string,
    notes: string,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const appointment = await appointmentRepository.getById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');
    if (appointment.facilitatorId !== facilitatorId) throw new Error('Not authorized');

    await appointmentRepository.update(appointmentId, {
      facilitatorNotes: notes,
    } as Partial<AppointmentDocument>);

    return appointmentId;
  }

  /**
   * Get available time slots for a facilitator on a specific date.
   * Dynamically computed from work hours minus existing active appointments.
   * Slots are 30-minute increments with 60-minute default duration.
   */
  async getAvailableSlots(
    facilitatorId: string,
    date: Date,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const dayOfWeek = date.getDay();
    const schedules = await workHoursRepository.getActiveByFacilitator(facilitatorId);
    const daySchedule = schedules.find(s => s.dayOfWeek === dayOfWeek);

    if (!daySchedule) return [];

    // Get existing ACTIVE appointments for this facilitator on this date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await appointmentRepository.getActiveByDateRange(
      facilitatorId,
      startOfDay,
      endOfDay,
    );

    // Generate available slots
    const [startHour, startMinute] = daySchedule.startTime.split(':').map(Number);
    const [endHour, endMinute] = daySchedule.endTime.split(':').map(Number);
    const slotDuration = 30; // 30-minute slots
    const defaultDuration = 60; // default 60-minute appointments

    const slots: { startTime: string; endTime: string; available: boolean }[] = [];
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;

    for (let m = startTotalMinutes; m + defaultDuration <= endTotalMinutes; m += slotDuration) {
      const slotStart = new Date(date);
      slotStart.setHours(0, Math.floor(m), 0, 0);
      const slotEnd = new Date(slotStart.getTime() + defaultDuration * 60 * 1000);

      // Check if slot conflicts with existing ACTIVE appointments
      const isBooked = existingAppointments.some((apt) => {
        const aptStart = apt.scheduledAt?.toDate?.() || new Date(apt.scheduledAt as any);
        const aptEnd = new Date(aptStart.getTime() + apt.durationMinutes * 60 * 1000);
        return slotStart < aptEnd && slotEnd > aptStart;
      });

      const hours = Math.floor(m / 60);
      const minutes = m % 60;
      const endHours = Math.floor((m + defaultDuration) / 60);
      const endMinutes = (m + defaultDuration) % 60;

      slots.push({
        startTime: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
        endTime: `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`,
        available: !isBooked,
      });
    }

    return slots;
  }

  async isSlotAvailable(
    facilitatorId: string,
    scheduledAt: Date,
    durationMinutes: number,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const slots = await this.getAvailableSlots(facilitatorId, scheduledAt, actorRole);
    const timeStr = `${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`;
    return slots.some(s => s.startTime === timeStr && s.available);
  }

  /**
   * Get unread notifications for a user.
   */
  async getUnreadNotifications(userId: string) {
    return notificationRepository.getUnreadByUserId(userId);
  }

  /**
   * Get all notifications for a user.
   */
  async getAllNotifications(userId: string) {
    return notificationRepository.getByUserId(userId);
  }

  /**
   * Mark a notification as read.
   */
  async markNotificationRead(notificationId: string) {
    return notificationRepository.update(notificationId, {
      isRead: true,
    } as Partial<any>);
  }

  /**
   * Mark all notifications as read for a user.
   */
  async markAllNotificationsRead(userId: string) {
    const notifications = await notificationRepository.getUnreadByUserId(userId);
    await Promise.all(
      notifications.map(n => notificationRepository.update(n.id, { isRead: true } as Partial<any>))
    );
  }
}

export const appointmentService = new AppointmentService();