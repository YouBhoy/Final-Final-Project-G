import { COLLECTIONS, WorkHoursScheduleDocument } from '@spartan-g/shared-types';
import { where, orderBy } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class WorkHoursRepository extends BaseRepository<WorkHoursScheduleDocument> {
  constructor() {
    super(COLLECTIONS.WORK_HOURS_SCHEDULES);
  }

  async getByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      orderBy('dayOfWeek', 'asc'),
    ]);
  }

  async getActiveByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('isActive', '==', true),
      orderBy('dayOfWeek', 'asc'),
    ]);
  }
}

export const workHoursRepository = new WorkHoursRepository();
