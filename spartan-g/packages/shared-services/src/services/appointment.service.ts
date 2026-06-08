import {
  PERMISSIONS,
  Role,
  AppointmentDocument,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import { Timestamp } from '../firebase/firestore';
import { appointmentRepository } from '../repositories/appointment.repository';

export interface CreateAppointmentPayload {
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

  async getUpcoming(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }
    return appointmentRepository.getUpcomingByFacilitator(facilitatorId);
  }

  async createAppointment(payload: CreateAppointmentPayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }
    const id = `${payload.facilitatorId}_${payload.studentId}_${Date.now()}`;
    await appointmentRepository.create(id, {
      studentId: payload.studentId,
      facilitatorId: payload.facilitatorId,
      scheduledAt: payload.scheduledAt as unknown as Timestamp,
      durationMinutes: payload.durationMinutes,
      notes: payload.notes,
      status: 'scheduled',
      notifyBeforeMinutes: payload.notifyBeforeMinutes ?? 30,
    } as AppointmentDocument);
    return id;
  }

  async cancelAppointment(appointmentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }
    return appointmentRepository.update(appointmentId, { status: 'cancelled' } as Partial<AppointmentDocument>);
  }
}

export const appointmentService = new AppointmentService();
