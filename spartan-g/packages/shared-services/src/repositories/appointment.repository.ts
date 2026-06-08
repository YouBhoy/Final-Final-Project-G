import { COLLECTIONS, AppointmentDocument } from '@spartan-g/shared-types';
import { where, orderBy } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class AppointmentRepository extends BaseRepository<AppointmentDocument> {
  constructor() {
    super(COLLECTIONS.APPOINTMENTS);
  }

  async getByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      orderBy('scheduledAt', 'asc'),
    ]);
  }

  async getUpcomingByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', '==', 'scheduled'),
      orderBy('scheduledAt', 'asc'),
    ]);
  }
}

export const appointmentRepository = new AppointmentRepository();
