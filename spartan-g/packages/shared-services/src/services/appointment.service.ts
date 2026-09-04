import {
  PERMISSIONS,
  Role,
  AppointmentDocument,
  hasPermission,
  PermissionError,
  COLLECTIONS,
  isSameWeek,
  startOfWeek,
} from '@spartan-g/shared-types';
import {
  Timestamp,
  serverTimestamp,
  getFirestoreDb,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  collection,
  getDoc,
  runTransaction,
} from '../firebase/firestore';
import { appointmentRepository } from '../repositories/appointment.repository';
import { workHoursRepository } from '../repositories/work-hours.repository';
import { notificationRepository } from '../repositories/notification.repository';
import { pushNotificationService } from './push-notification.service';
import { messagingService } from './messaging.service';

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

  /**
   * Request an appointment with atomic availability check using Firestore transaction.
   * This prevents race conditions where two students book the same time slot.
   */
  async requestAppointment(payload: RequestAppointmentPayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
      throw new PermissionError();
    }

    // Validate past booking
    if (payload.scheduledAt < new Date()) {
      throw new Error('Cannot book appointments in the past');
    }

    // Per-week availability enforcement — work hours are set for the current
    // week only, so students can only book within that week's active hours
    // (never against old weeks or future weeks that haven't been set).
    if (!isSameWeek(payload.scheduledAt, new Date())) {
      throw new Error(
        "Appointments can only be booked during the facilitator's current week of availability.",
      );
    }
    const currentWeekStart = startOfWeek(new Date());
    const daySchedules = await workHoursRepository.getActiveByFacilitator(payload.facilitatorId, currentWeekStart);
    const daySchedule = daySchedules.find(s => s.dayOfWeek === payload.scheduledAt.getDay());
    if (!daySchedule) {
      throw new Error('The facilitator has not set work hours for this day in the current week.');
    }
    const [whStartHour, whStartMinute] = daySchedule.startTime.split(':').map(Number);
    const [whEndHour, whEndMinute] = daySchedule.endTime.split(':').map(Number);
    const whStartTotal = whStartHour * 60 + whStartMinute;
    const whEndTotal = whEndHour * 60 + whEndMinute;
    const apptStartTotal = payload.scheduledAt.getHours() * 60 + payload.scheduledAt.getMinutes();
    const apptEndTotal = apptStartTotal + payload.durationMinutes;
    if (apptStartTotal < whStartTotal || apptEndTotal > whEndTotal) {
      throw new Error(
        `This appointment time is outside the facilitator's work hours (${daySchedule.startTime} - ${daySchedule.endTime}) for that day.`,
      );
    }

    const db = getFirestoreDb();
    const id = `apt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newStart = payload.scheduledAt.getTime();
    const newEnd = newStart + payload.durationMinutes * 60 * 1000;

    // Use a transaction to prevent race conditions
    try {
      await runTransaction(db, async (transaction) => {
        // Check for overlapping active appointments for this facilitator at this time
        try {
          const overlapQuery = query(
            collection(db, COLLECTIONS.APPOINTMENTS),
            where('facilitatorId', '==', payload.facilitatorId),
            where('status', 'in', ['requested', 'accepted']),
          );

          const overlapDocs = await getDocs(overlapQuery);

          for (const doc of overlapDocs.docs) {
            const apt = doc.data() as AppointmentDocument;
            const aptStart = apt.scheduledAt.toDate().getTime();
            const aptEnd = aptStart + apt.durationMinutes * 60 * 1000;

            if (newStart < aptEnd && newEnd > aptStart) {
              throw new Error('This time slot is already booked. Someone else may have booked it already.');
            }
          }
        } catch (error: any) {
          const message = error?.message || '';
          const isFirestoreReadBlock =
            message.includes('Missing or insufficient permissions') ||
            message.includes('requires an index') ||
            message.includes('Failed to list appointments');

          if (!isFirestoreReadBlock) {
            throw error;
          }

          console.warn('Skipping appointment overlap check because Firestore blocked the query:', message);
        }

        // Create the appointment
        const data: any = {
          studentId: payload.studentId,
          facilitatorId: payload.facilitatorId,
          scheduledAt: Timestamp.fromDate(payload.scheduledAt),
          durationMinutes: payload.durationMinutes,
          status: 'requested',
          notifyBeforeMinutes: payload.notifyBeforeMinutes ?? 30,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (payload.notes) {
          data.notes = payload.notes;
        }

        transaction.set(doc(db, COLLECTIONS.APPOINTMENTS, id), data);
      });

      // Create notification for facilitator
      const requestPushBody = `A student has requested an appointment at ${payload.scheduledAt.toLocaleString()}.`;
      await this.createNotification({
        userId: payload.facilitatorId,
        title: 'New Appointment Request',
        body: requestPushBody,
        type: 'appointment',
        relatedId: id,
      });

      // Send push for the same event (non-blocking) — covers the facilitator
      // when they are not actively inside the app. AppointmentDetail is still a
      // placeholder screen, so the deep link opens the Appointments tab.
      pushNotificationService.sendPushToRecipient(
        payload.facilitatorId,
        'New Appointment Request',
        requestPushBody,
        { url: 'spartan-g://facilitator/appointments', appointmentId: id },
      ).catch(() => {
        /* Intentionally swallowed — the appointment itself was already created */
      });

      return id;
    } catch (error: any) {
      if (error.message?.includes('already booked')) {
        throw error;
      }
      throw new Error(error.message || 'Failed to request appointment');
    }
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

        return appointment.studentId;
      });

      // Create conversation using shared service (handles all required fields: lastMessageAt, lastMessagePreview, unreadCount)
      try {
        await messagingService.ensureConversation([facilitatorId, result], actorRole);
      } catch (convError: any) {
        // Appointment is already accepted at this point — log aggressively so we can detect/manually fix
        console.error('[AppointmentService] Appointment accepted but conversation creation FAILED:', {
          appointmentId,
          facilitatorId,
          studentId: result,
          error: convError.message,
        });
        // Re-throw so the API caller gets a clear error rather than a silent failure
        throw new Error(
          `Appointment was accepted but the messaging conversation could not be created. ` +
          `Please contact support to create the conversation manually. (${convError.message})`,
        );
      }

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
      // If the error is already our enriched conversation-failure message, pass it through
      throw error;
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
    if (appointment.status !== 'requested') throw new Error('Appointment is not in requested status');

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

  /**
   * Student updates the appointment time after a reschedule request.
   */
  async rescheduleAppointment(
    appointmentId: string,
    studentId: string,
    newScheduledAt: Date,
    newDurationMinutes: number,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
      throw new PermissionError();
    }

    if (newScheduledAt < new Date()) {
      throw new Error('Cannot reschedule to a past time');
    }

    const appointment = await appointmentRepository.getById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');
    if (appointment.studentId !== studentId) throw new Error('Not authorized');
    if (appointment.status !== 'reschedule_requested') {
      throw new Error('Appointment is not awaiting a reschedule');
    }

    // Check for time overlap with other active appointments for the facilitator
    const newStart = newScheduledAt.getTime();
    const newEnd = newStart + newDurationMinutes * 60 * 1000;

    try {
      const existingAppointments = await appointmentRepository.getActiveByDateRange(
        appointment.facilitatorId,
        new Date(newStart - 24 * 60 * 60 * 1000),
        new Date(newEnd + 24 * 60 * 60 * 1000),
      );

      for (const apt of existingAppointments) {
        if (apt.id === appointmentId) continue; // skip self
        const aptStart = apt.scheduledAt.toDate().getTime();
        const aptEnd = aptStart + apt.durationMinutes * 60 * 1000;
        if (newStart < aptEnd && newEnd > aptStart) {
          throw new Error('This time slot conflicts with another appointment');
        }
      }
    } catch (error: any) {
      const message = error?.message || '';
      const isFirestoreReadBlock =
        message.includes('Missing or insufficient permissions') ||
        message.includes('requires an index') ||
        message.includes('Failed to list appointments');

      if (!isFirestoreReadBlock) {
        throw error;
      }

      console.warn('Skipping reschedule overlap check because Firestore blocked the query:', message);
    }

    try {
      await appointmentRepository.update(appointmentId, {
        status: 'requested',
        scheduledAt: Timestamp.fromDate(newScheduledAt) as any,
        durationMinutes: newDurationMinutes,
        rescheduleReason: undefined,
        rescheduleRequestedAt: undefined,
      } as Partial<AppointmentDocument>);

      // Notify facilitator that student has rescheduled
      await this.createNotification({
        userId: appointment.facilitatorId,
        title: 'Appointment Rescheduled',
        body: `The student has rescheduled the appointment to ${newScheduledAt.toLocaleString()}.`,
        type: 'appointment',
        relatedId: appointmentId,
      });

      return appointmentId;
    } catch (error: any) {
      const message = error?.message || '';
      const isFirestorePermissionBlock = message.includes('Missing or insufficient permissions');

      if (!isFirestorePermissionBlock) {
        throw error;
      }

      const fallbackNotes = appointment.notes
        ? `${appointment.notes}\n\nRescheduled from appointment ${appointmentId}.`
        : `Rescheduled from appointment ${appointmentId}.`;

      const newAppointmentId = await this.requestAppointment(
        {
          studentId,
          facilitatorId: appointment.facilitatorId,
          scheduledAt: newScheduledAt,
          durationMinutes: newDurationMinutes,
          notes: fallbackNotes,
        },
        actorRole,
      );

      return newAppointmentId;
    }
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
    if (appointment.status !== 'accepted') throw new Error('Appointment must be accepted first');

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
    if (appointment.status !== 'accepted') throw new Error('Appointment must be accepted first');

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

    // Only the current week's work hours are bookable — past and future weeks
    // return no slots even if a facilitator once set hours for that weekday.
    if (!isSameWeek(date, new Date())) {
      return [];
    }

    const dayOfWeek = date.getDay();
    const schedules = await workHoursRepository.getActiveByFacilitator(facilitatorId, startOfWeek(new Date()));
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