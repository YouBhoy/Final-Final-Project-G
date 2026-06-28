import {
  PERMISSIONS,
  Role,
  WorkHoursScheduleDocument,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import { workHoursRepository } from '../repositories/work-hours.repository';

export interface WorkHoursSchedulePayload {
  facilitatorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  notifyBeforeMinutes?: number;
}

class WorkHoursService {
  async getSchedule(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_WORK_HOURS)) {
      throw new PermissionError();
    }
    return workHoursRepository.getByFacilitator(facilitatorId);
  }

  async getActiveSchedule(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_WORK_HOURS)) {
      if (hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
        return workHoursRepository.getActiveByFacilitator(facilitatorId);
      }
      throw new PermissionError();
    }
    return workHoursRepository.getActiveByFacilitator(facilitatorId);
  }

  async createScheduleEntry(payload: WorkHoursSchedulePayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_WORK_HOURS)) {
      throw new PermissionError();
    }
    const id = `${payload.facilitatorId}_day${payload.dayOfWeek}`;
    await workHoursRepository.create(id, {
      ...payload,
      isActive: true,
      notifyBeforeMinutes: payload.notifyBeforeMinutes ?? 15,
    } as WorkHoursScheduleDocument);
    return id;
  }

  async updateScheduleEntry(
    scheduleId: string,
    data: Partial<WorkHoursScheduleDocument>,
    actorRole: Role,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_WORK_HOURS)) {
      throw new PermissionError();
    }
    return workHoursRepository.update(scheduleId, data);
  }

  async toggleSchedule(scheduleId: string, isActive: boolean, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_WORK_HOURS)) {
      throw new PermissionError();
    }
    return workHoursRepository.update(scheduleId, { isActive } as Partial<WorkHoursScheduleDocument>);
  }
}

export const workHoursService = new WorkHoursService();