import { COLLECTIONS, AppointmentDocument } from '@spartan-g/shared-types';
import { where, orderBy, Timestamp } from '../firebase/firestore';
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
      where('status', '==', 'accepted'),
      orderBy('scheduledAt', 'asc'),
    ]);
  }

  /** Fetch all appointments for a specific student (for timeline views). */
  async getByStudent(studentId: string) {
    return this.getAll([
      where('studentId', '==', studentId),
      orderBy('scheduledAt', 'desc'),
    ]);
  }

  /** Fetch active (requested or accepted) appointments for a date range. */
  async getActiveByDateRange(facilitatorId: string, startDate: Date, endDate: Date) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', 'in', ['requested', 'accepted']),
      where('scheduledAt', '>=', Timestamp.fromDate(startDate)),
      where('scheduledAt', '<=', Timestamp.fromDate(endDate)),
    ]);
  }
}

export const appointmentRepository = new AppointmentRepository();