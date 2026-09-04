import {
  PERMISSIONS,
  Role,
  WorkHoursScheduleDocument,
  hasPermission,
  PermissionError,
  startOfWeek,
  weekKey,
} from '@spartan-g/shared-types';
import { workHoursRepository } from '../repositories/work-hours.repository';
import { Timestamp } from '../firebase/firestore';

export interface WorkHoursSchedulePayload {
  facilitatorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  notifyBeforeMinutes?: number;
  /** Monday of the week these hours belong to. Defaults to the current week. */
  weekStartDate?: Date;
}

class WorkHoursService {
  /** Current week's schedules (or the week given by `weekStartDate`). */
  async getSchedule(facilitatorId: string, actorRole: Role, weekStartDate: Date = startOfWeek(new Date())) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_WORK_HOURS)) {
      throw new PermissionError();
    }
    return workHoursRepository.getByFacilitator(facilitatorId, weekStartDate);
  }

  /** Current week's active schedules (or the week given by `weekStartDate`). */
  async getActiveSchedule(facilitatorId: string, actorRole: Role, weekStartDate: Date = startOfWeek(new Date())) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_WORK_HOURS)) {
      if (hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
        return workHoursRepository.getActiveByFacilitator(facilitatorId, weekStartDate);
      }
      throw new PermissionError();
    }
    return workHoursRepository.getActiveByFacilitator(facilitatorId, weekStartDate);
  }

  async createScheduleEntry(payload: WorkHoursSchedulePayload, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_WORK_HOURS)) {
      throw new PermissionError();
    }
    const weekStartDate = startOfWeek(payload.weekStartDate ?? new Date());
    // Per-week document ID keeps each week's hours separate, so past weeks
    // remain in Firestore as history without being re-applied automatically.
    const id = `${payload.facilitatorId}_week${weekKey(weekStartDate)}_day${payload.dayOfWeek}`;
    await workHoursRepository.create(id, {
      ...payload,
      weekStartDate: Timestamp.fromDate(weekStartDate),
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