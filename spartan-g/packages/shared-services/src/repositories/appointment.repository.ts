import { COLLECTIONS, AppointmentDocument } from '@spartan-g/shared-types';
import { where, Timestamp } from '../firebase/firestore';
import { BaseRepository } from './base.repository';
import { collection, doc, getDocFromServer, getDocsFromServer, query, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getFirestoreDb } from '../firebase/firestore';

class AppointmentRepository extends BaseRepository<AppointmentDocument> {
  constructor() {
    super(COLLECTIONS.APPOINTMENTS);
  }

  /** Keep the public busy-time projection synchronized with private appointment edits. */
  async update(id: string, changes: Partial<AppointmentDocument>): Promise<void> {
    const db = getFirestoreDb(), ref = doc(db, 'appointments', id);
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('Appointment not found');
      const updates = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      const next = { ...snapshot.data(), ...updates };
      transaction.update(ref, { ...updates, updatedAt: serverTimestamp() });
      transaction.set(doc(db, 'appointment_availability', id), {
        facilitatorId: next.facilitatorId, scheduledAt: next.scheduledAt,
        durationMinutes: next.durationMinutes, status: next.status,
      });
    });
  }

  /** Students receive scheduling metadata only, never another student's appointment. */
  async getActiveAvailability(facilitatorId: string, startDate: Date, endDate: Date) {
    const db = getFirestoreDb();
    const config = await getDocFromServer(doc(db, 'appointment_booking_config', 'spark'));
    if (config.data()?.availabilityVersion !== 1) throw new Error('Appointment availability is being initialized. Please try again later.');
    const snapshot = await getDocsFromServer(query(collection(db, 'appointment_availability'), where('facilitatorId', '==', facilitatorId)));
    return snapshot.docs.map(row => row.data() as Pick<AppointmentDocument, 'scheduledAt' | 'durationMinutes' | 'status'>)
      .filter(row => ['requested', 'accepted'].includes(row.status)
        && row.scheduledAt.toMillis() + row.durationMinutes * 60000 > startDate.getTime()
        && row.scheduledAt.toMillis() <= endDate.getTime());
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
