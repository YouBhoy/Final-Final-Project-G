import {
  PERMISSIONS,
  Role,
  AppointmentDocument,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import { Timestamp, serverTimestamp } from '../firebase/firestore';
import { appointmentRepository } from '../repositories/appointment.repository';
import { workHoursRepository } from '../repositories/work-hours.repository';
import { facilitatorStudentLinkRepository } from '../repositories/facilitator-student-link.repository';
import { appointmentSlotRepository } from '../repositories/appointment-slot.repository';
import { messagingService } from './messaging.service';

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

  async requestAppointment(payload: RequestAppointmentPayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const id = `${payload.facilitatorId}_${payload.studentId}_${Date.now()}`;
    await appointmentRepository.create(id, {
      studentId: payload.studentId,
      facilitatorId: payload.facilitatorId,
      scheduledAt: payload.scheduledAt as unknown as Timestamp,
      durationMinutes: payload.durationMinutes,
      notes: payload.notes,
      status: 'requested',
      notifyBeforeMinutes: payload.notifyBeforeMinutes ?? 30,
    } as AppointmentDocument);
    return id;
  }

  async acceptAppointment(appointmentId: string, facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const appointment = await appointmentRepository.getById(appointmentId);
    if (!appointment) throw new Error('Appointment not found');
    if (appointment.facilitatorId !== facilitatorId) throw new Error('Not authorized');
    if (appointment.status !== 'requested') throw new Error('Appointment is not in requested status');

    // Update appointment status with timestamp
    await appointmentRepository.update(appointmentId, {
      status: 'accepted',
      acceptedAt: serverTimestamp() as any,
    } as Partial<AppointmentDocument>);

    // Auto-create facilitator_student_link if missing
    const existingLink = await facilitatorStudentLinkRepository.findLink(
      facilitatorId,
      appointment.studentId,
    );

    if (!existingLink) {
      const linkId = `${facilitatorId}_${appointment.studentId}`;
      await facilitatorStudentLinkRepository.create(linkId, {
        facilitatorId,
        studentId: appointment.studentId,
        status: 'accepted',
        requestedAt: serverTimestamp() as any,
        respondedAt: serverTimestamp() as any,
      } as any);
    } else if (existingLink.status !== 'accepted') {
      await facilitatorStudentLinkRepository.update(existingLink.id, {
        status: 'accepted',
        respondedAt: serverTimestamp() as any,
      } as any);
    }

    // Auto-create conversation if missing
    const conversationId = [facilitatorId, appointment.studentId].sort().join('_');
    const existingConversation = await messagingService.getConversations(facilitatorId, actorRole);
    const conversationExists = existingConversation.some(c => c.id === conversationId);

    if (!conversationExists) {
      await messagingService.createConversation(
        [facilitatorId, appointment.studentId],
        actorRole,
      );
    }

    // Mark slot as reserved with appointment ID
    const slots = await appointmentSlotRepository.getByFacilitator(facilitatorId);
    const matchingSlot = slots.find(s => {
      const slotStart = s.startTime.toDate();
      const aptTime = appointment.scheduledAt.toDate();
      return Math.abs(slotStart.getTime() - aptTime.getTime()) < 60000;
    });
    
    if (matchingSlot && matchingSlot.status === 'reserved') {
      await appointmentSlotRepository.update(matchingSlot.id, {
        status: 'reserved',
        appointmentId,
      } as Partial<any>);
    }

    return { appointmentId, conversationId };
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

    const cancellationReason = isStudent ? 'Cancelled by student' : 'Cancelled by facilitator';
    await appointmentRepository.update(appointmentId, {
      status: 'cancelled',
      cancellationReason,
    } as Partial<AppointmentDocument>);

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

    // Get existing appointments for this facilitator on this date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await appointmentRepository.getAll([
      { fieldPath: 'facilitatorId', op: '==', value: facilitatorId } as any,
      { fieldPath: 'scheduledAt', op: '>=', value: startOfDay } as any,
      { fieldPath: 'scheduledAt', op: '<=', value: endOfDay } as any,
    ]);

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

      // Check if slot conflicts with existing appointments
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