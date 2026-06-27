import { COLLECTIONS, AppointmentSlotDocument } from '@spartan-g/shared-types';
import { where, orderBy, Timestamp } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class AppointmentSlotRepository extends BaseRepository<AppointmentSlotDocument> {
  constructor() {
    super(COLLECTIONS.APPOINTMENT_SLOTS);
  }

  async getByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      orderBy('startTime', 'asc'),
    ]);
  }

  async getAvailableByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', '==', 'available'),
      orderBy('startTime', 'asc'),
    ]);
  }

  async getAvailableByDateRange(facilitatorId: string, startDate: Date, endDate: Date) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', '==', 'available'),
      where('startTime', '>=', Timestamp.fromDate(startDate)),
      where('startTime', '<=', Timestamp.fromDate(endDate)),
      orderBy('startTime', 'asc'),
    ]);
  }

  async checkOverlap(facilitatorId: string, startTime: Date, endTime: Date) {
    const slots = await this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', '==', 'available'),
    ]);

    return slots.some(slot => {
      const slotStart = slot.startTime.toDate();
      const slotEnd = slot.endTime.toDate();
      return startTime < slotEnd && endTime > slotStart;
    });
  }
}

export const appointmentSlotRepository = new AppointmentSlotRepository();