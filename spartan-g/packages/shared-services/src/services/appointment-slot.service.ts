import {
  PERMISSIONS,
  Role,
  AppointmentSlotDocument,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import { Timestamp, serverTimestamp } from '../firebase/firestore';
import { appointmentSlotRepository } from '../repositories/appointment-slot.repository';
import { workHoursRepository } from '../repositories/work-hours.repository';

export interface CreateSlotPayload {
  facilitatorId: string;
  startTime: Date;
  endTime: Date;
}

export interface UpdateSlotPayload {
  startTime?: Date;
  endTime?: Date;
}

class AppointmentSlotService {
  async getSlots(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }
    return appointmentSlotRepository.getByFacilitator(facilitatorId);
  }

  async getAvailableSlots(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
      throw new PermissionError();
    }
    return appointmentSlotRepository.getAvailableByFacilitator(facilitatorId);
  }

  async getAvailableSlotsByDateRange(facilitatorId: string, startDate: Date, endDate: Date, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
      throw new PermissionError();
    }
    return appointmentSlotRepository.getAvailableByDateRange(facilitatorId, startDate, endDate);
  }

  async createSlot(payload: CreateSlotPayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    // Validate against work hours
    const dayOfWeek = payload.startTime.getDay();
    const schedules = await workHoursRepository.getActiveByFacilitator(payload.facilitatorId);
    const daySchedule = schedules.find(s => s.dayOfWeek === dayOfWeek);

    if (!daySchedule) {
      throw new Error(
        'No work hours configured for this day. Please set your work hours in the Work Hours page before creating slots.'
      );
    }

    // Validate slot time falls within configured work hours
    const slotStartStr = `${String(payload.startTime.getHours()).padStart(2, '0')}:${String(payload.startTime.getMinutes()).padStart(2, '0')}`;
    const slotEndStr = `${String(payload.endTime.getHours()).padStart(2, '0')}:${String(payload.endTime.getMinutes()).padStart(2, '0')}`;
    
    if (slotStartStr < daySchedule.startTime || slotEndStr > daySchedule.endTime) {
      throw new Error(
        `Slot time (${slotStartStr} - ${slotEndStr}) must be within configured work hours (${daySchedule.startTime} - ${daySchedule.endTime}) for this day.`
      );
    }

    // Check for overlaps
    const hasOverlap = await appointmentSlotRepository.checkOverlap(
      payload.facilitatorId,
      payload.startTime,
      payload.endTime,
    );

    if (hasOverlap) {
      throw new Error('Slot overlaps with an existing available slot');
    }

    const id = `slot_${payload.facilitatorId}_${Date.now()}`;
    await appointmentSlotRepository.create(id, {
      facilitatorId: payload.facilitatorId,
      startTime: payload.startTime as unknown as Timestamp,
      endTime: payload.endTime as unknown as Timestamp,
      status: 'available',
    } as AppointmentSlotDocument);

    return id;
  }

  async updateSlot(slotId: string, facilitatorId: string, payload: UpdateSlotPayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const slot = await appointmentSlotRepository.getById(slotId);
    if (!slot) throw new Error('Slot not found');
    if (slot.facilitatorId !== facilitatorId) throw new Error('Not authorized');
    if (slot.status !== 'available') throw new Error('Can only edit available slots');

    const updates: Partial<AppointmentSlotDocument> = {};

    if (payload.startTime) {
      updates.startTime = payload.startTime as unknown as Timestamp;
    }

    if (payload.endTime) {
      updates.endTime = payload.endTime as unknown as Timestamp;
    }

    await appointmentSlotRepository.update(slotId, updates);
    return slotId;
  }

  async deleteSlot(slotId: string, facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const slot = await appointmentSlotRepository.getById(slotId);
    if (!slot) throw new Error('Slot not found');
    if (slot.facilitatorId !== facilitatorId) throw new Error('Not authorized');
    if (slot.status !== 'available') throw new Error('Can only delete available slots');

    await appointmentSlotRepository.delete(slotId);
    return slotId;
  }

  async reserveSlot(slotId: string, appointmentId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const slot = await appointmentSlotRepository.getById(slotId);
    if (!slot) throw new Error('Slot not found');
    if (slot.status !== 'available') throw new Error('Slot is not available');

    await appointmentSlotRepository.update(slotId, {
      status: 'reserved',
      appointmentId,
    } as Partial<AppointmentSlotDocument>);

    return slotId;
  }

  async releaseSlot(slotId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const slot = await appointmentSlotRepository.getById(slotId);
    if (!slot) throw new Error('Slot not found');
    if (slot.status !== 'reserved') throw new Error('Slot is not reserved');

    await appointmentSlotRepository.update(slotId, {
      status: 'available',
      appointmentId: undefined,
    } as Partial<AppointmentSlotDocument>);

    return slotId;
  }

  async completeSlot(slotId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const slot = await appointmentSlotRepository.getById(slotId);
    if (!slot) throw new Error('Slot not found');
    if (slot.status !== 'reserved') throw new Error('Slot is not reserved');

    await appointmentSlotRepository.update(slotId, {
      status: 'completed',
    } as Partial<AppointmentSlotDocument>);

    return slotId;
  }

  async cancelSlot(slotId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_APPOINTMENTS)) {
      throw new PermissionError();
    }

    const slot = await appointmentSlotRepository.getById(slotId);
    if (!slot) throw new Error('Slot not found');
    if (slot.status !== 'reserved') throw new Error('Slot is not reserved');

    await appointmentSlotRepository.update(slotId, {
      status: 'cancelled',
    } as Partial<AppointmentSlotDocument>);

    return slotId;
  }
}

export const appointmentSlotService = new AppointmentSlotService();