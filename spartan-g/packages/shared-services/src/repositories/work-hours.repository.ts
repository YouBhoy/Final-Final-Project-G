import { COLLECTIONS, WorkHoursScheduleDocument, isSameWeek } from '@spartan-g/shared-types';
import { where } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

/**
 * Work hours are per-week: each document belongs to one Monday–Sunday week via
 * `weekStartDate`. Queries accept an optional `weekStartDate` (the Monday of the
 * week) so only the matching week's schedules are considered — past weeks stay
 * in Firestore as history but are no longer returned as active/current.
 */
class WorkHoursRepository extends BaseRepository<WorkHoursScheduleDocument> {
  constructor() {
    super(COLLECTIONS.WORK_HOURS_SCHEDULES);
  }

  /** Schedules for one week (`weekStartDate`) — defaults to all weeks for history queries. */
  async getByFacilitator(facilitatorId: string, weekStartDate?: Date) {
    const data = await this.getAll([
      where('facilitatorId', '==', facilitatorId),
    ]);
    const filtered = weekStartDate
      ? data.filter((s) => this.matchesWeek(s.weekStartDate, weekStartDate))
      : data;
    return filtered.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  }

  /** Active schedules for one week (`weekStartDate`) — defaults to all active weeks. */
  async getActiveByFacilitator(facilitatorId: string, weekStartDate?: Date) {
    const data = await this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('isActive', '==', true),
    ]);
    const filtered = weekStartDate
      ? data.filter((s) => this.matchesWeek(s.weekStartDate, weekStartDate))
      : data;
    return filtered.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  }

  /** Compare a stored `weekStartDate` (Firestore Timestamp) against a week. */
  private matchesWeek(stored: unknown, weekStartDate: Date): boolean {
    if (!stored) return false;
    const date =
      typeof (stored as { toDate?: () => Date }).toDate === 'function'
        ? (stored as { toDate: () => Date }).toDate()
        : new Date(stored as any);
    return isSameWeek(date, weekStartDate);
  }
}

export const workHoursRepository = new WorkHoursRepository();
