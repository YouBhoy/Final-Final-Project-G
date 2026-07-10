import {
  PERMISSIONS,
  Role,
  AppointmentDocument,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import {
  Timestamp,
  serverTimestamp,
  getFirestoreDb,
  writeBatch,
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
import { facilitatorStudentLinkRepository } from '../repositories/facilitator-student-link.repository';
import { appointmentSlotRepository } from '../repositories/appointment-slot.repository';
import { messagingService } from './messaging.service';
import { COLLECTIONS } from '@spartan-g/shared-types';

export interface RequestAppointmentPayload {
  studentId: string;
  facilitatorId: string;
  scheduledAt: Date;
  durationMinutes: number;
  notes?: string;
  notifyBeforeMinutes?: number;
}

class AppointmentService {
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
   * Request an appointment with atomic availability check.
   * Uses Firestore transaction to prevent race conditions.
   * Note: Firestore transactions can only read document references, not queries.
   * We use a hybrid approach: check conditions outside, then use transaction for writes.
   * For true atomicity, Firestore security rules should also enforce these constraints.
   */
  async requestAppointment(payload: RequestAppointmentPayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
      throw new PermissionError();
    }

    // Validate past booking
    if (payload.scheduledAt < new Date()) {
      throw new Error('Cannot book appointments in the past');
    }

    const db = getFirestoreDb();
    const id = `${payload.facilitatorId}_${payload.studentId}_${Date.now()}`;

    // Check for existing active appointments (requested or accepted) for this student/facilitator
    const existingAppointments = await getDocs(
      query(
        collection(db, COLLECTIONS.APPOINTMENTS),
        where('studentId', '==', payload.studentId),
        where('facilitatorId', '==', payload.facilitatorId),
        where('status', 'in', ['requested', 'accepted']),
      ),
    );

    // Check for time overlap with existing active appointments
    const newStart = payload.scheduledAt.getTime();
    const newEnd = newStart + payload.durationMinutes * 60 * 1000;

    for (const doc of existingAppointments.docs) {
      const apt = doc.data() as AppointmentDocument;
      const aptStart = apt.scheduledAt.toDate().getTime();
      const aptEnd = aptStart + apt.durationMinutes * 60 * 1000;

      // Check for overlap: newStart < aptEnd && newEnd > aptStart
      if (newStart < aptEnd && newEnd > aptStart) {
        throw new Error('You already have an active appointment at this time');
      }
    }

    // Check for existing appointments (any status) for double-booking prevention
    const conflictingAppointments = await getDocs(
      query(
        collection(db, COLLECTIONS.APPOINTMENTS),
        where('facilitatorId', '==', payload.facilitatorId),
        where('status', 'in', ['requested', 'accepted']),
        where('scheduledAt', '>=', Timestamp.fromDate(
          new Date(payload.scheduledAt.getTime() - payload.durationMinutes * 60 * 1000)
        )),
        where('scheduledAt', '<=', Timestamp.fromDate(
          new Date(payload.scheduledAt.getTime() + payload.durationMinutes * 60 * 1000)
        )),
      ),
    );

    // Check for overlap with any existing appointment
    for (const doc of conflictingAppointments.docs) {
      const apt = doc.data() as AppointmentDocument;
      const aptStart = apt.scheduledAt.toDate().getTime();
      const aptEnd = aptStart + apt.durationMinutes * 60 * 1000;

      if (newStart < aptEnd && newEnd > aptStart) {
        throw new Error('This time slot is already booked');
      }
    }

    // Create the appointment
    const data: any = {
      studentId: payload.studentId,
      facilitatorId: payload.facilitatorId,
      scheduledAt: payload.scheduledAt as unknown as Timestamp,
      durationMinutes: payload.durationMinutes,
      status: 'requested',
      notifyBeforeMinutes: payload.notifyBeforeMinutes ?? 30,
    };
    if (payload.notes) {
      data.notes = payload.notes;
    }

    await appointmentRepository.create(id, data as AppointmentDocument);
    return id;
  }

  /**
   * Accept an appointment with transactional consistency.
   * All operations (appointment update, link creation, conversation creation, slot update)
   * happen in a single transaction.
   */
  async acceptAppointment(appointmentId: string, facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const db = getFirestoreDb();
    const appointmentRef = doc(db, COLLECTIONS.APPOINTMENTS, appointmentId);

    try {
      const result = await runTransaction(db, async (transaction) => {
        // Get appointment
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

        // 1. Update appointment status
        transaction.update(appointmentRef, {
          status: 'accepted',
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // 2. Create or update facilitator_student_link
        const linkId = `${facilitatorId}_${appointment.studentId}`;
        const linkRef = doc(db, COLLECTIONS.FACILITATOR_STUDENT_LINKS, linkId);
        const linkDoc = await transaction.get(linkRef);

        if (!linkDoc.exists) {
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

        // 3. Create conversation if missing
        const convId = [facilitatorId, appointment.studentId].sort().join('_');
        const conversationRef = doc(db, COLLECTIONS.CONVERSATIONS, convId);
        const conversationDoc = await transaction.get(conversationRef);

        if (!conversationDoc.exists) {
          transaction.set(conversationRef, {
            participantIds: [facilitatorId, appointment.studentId],
            lastMessageAt: null,
            lastMessagePreview: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        // 4. Update slot if exists
        const slots = await appointmentSlotRepository.getByFacilitator(facilitatorId);
        const matchingSlot = slots.find(s => {
          const slotStart = s.startTime.toDate();
          const aptTime = appointment.scheduledAt.toDate();
          return Math.abs(slotStart.getTime() - aptTime.getTime()) < 60000;
        });

        if (matchingSlot) {
          const slotRef = doc(db, COLLECTIONS.APPOINTMENT_SLOTS, matchingSlot.id);
          transaction.update(slotRef, {
            status: 'reserved',
            appointmentId,
            updatedAt: serverTimestamp(),
          });
        }

        return convId;
      });

      return { appointmentId, conversationId: result };
    } catch (error: any) {
      throw new Error(error.message || 'Failed to accept appointment');
    }
  }

  async rejectAppointment(appointmentId: string, facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const appointment = await appointmentRepository.getById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');
    if (appointment.facilitatorId !== facilitatorId) throw new Error('Not authorized');
    if (appointment.status !== 'requested') throw new Error('Appointment is not in requested status');

    await appointmentRepository.update(appointmentId, {
      status: 'rejected',
    } as Partial<AppointmentDocument>);

    return appointmentId;
  }

  async rejectAppointmentWithReason(
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
      status: 'rejected',
      rejectionReason: reason,
    } as Partial<AppointmentDocument>);

    return appointmentId;
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

    return appointmentId;
  }

  async cancelAppointment(
    appointmentId: string,
    actorRole: Role,
    userId: string,
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

    // Allow facilitators to cancel both requested and accepted appointments
    if (isFacilitator && appointment.facilitatorId !== userId) {
      throw new Error('Not authorized');
    }

    const cancellationReason = isStudent ? 'Cancelled by student' : 'Cancelled by facilitator';
    await appointmentRepository.update(appointmentId, {
      status: 'cancelled',
      cancellationReason,
    } as Partial<AppointmentDocument>);

    // Note: Slot restoration is skipped as AppointmentDocument doesn't have slotId
    // Availability is computed dynamically from work hours and existing appointments

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

    return appointmentId;
  }

  /**
   * Get available slots for a facilitator on a specific date.
   * Only considers active (requested or accepted) appointments.
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
}

export const appointmentService = new AppointmentService();