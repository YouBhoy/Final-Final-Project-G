import { COLLECTIONS, AppointmentDocument } from '@spartan-g/shared-types';
import { where, Timestamp } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class AppointmentRepository extends BaseRepository<AppointmentDocument> {
  constructor() {
    super(COLLECTIONS.APPOINTMENTS);
  }

  private static getAppointmentTime(appointment: AppointmentDocument & { id: string }) {
    return appointment.scheduledAt?.toDate?.().getTime?.() ?? new Date(appointment.scheduledAt as any).getTime();
  }

  async getByFacilitator(facilitatorId: string) {
    const appointments = await this.getAll([
      where('facilitatorId', '==', facilitatorId),
    ]);

    return appointments.sort((a, b) => AppointmentRepository.getAppointmentTime(a) - AppointmentRepository.getAppointmentTime(b));
  }

  async getUpcomingByFacilitator(facilitatorId: string) {
    const appointments = await this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', '==', 'accepted'),
    ]);

    return appointments.sort((a, b) => AppointmentRepository.getAppointmentTime(a) - AppointmentRepository.getAppointmentTime(b));
  }

  /** Fetch all appointments for a specific student (for timeline views). */
  async getByStudent(studentId: string) {
    const appointments = await this.getAll([
      where('studentId', '==', studentId),
    ]);

    return appointments.sort((a, b) => AppointmentRepository.getAppointmentTime(b) - AppointmentRepository.getAppointmentTime(a));
  }

  /** Fetch active (requested or accepted) appointments for a date range. */
  async getActiveByDateRange(facilitatorId: string, startDate: Date, endDate: Date) {
    const appointments = await this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', 'in', ['requested', 'accepted']),
    ]);

    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    return appointments
      .filter((appointment) => {
        const scheduledAtMs = AppointmentRepository.getAppointmentTime(appointment);
        return scheduledAtMs >= startMs && scheduledAtMs <= endMs;
      })
      .sort((a, b) => AppointmentRepository.getAppointmentTime(a) - AppointmentRepository.getAppointmentTime(b));
  }
}

export const appointmentRepository = new AppointmentRepository();