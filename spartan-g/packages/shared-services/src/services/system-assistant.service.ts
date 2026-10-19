import { getFirebaseAuth } from '../firebase/auth';
import { useAuthStore } from '../store/auth.store';
import { appointmentService } from './appointment.service';
import { assessmentService } from './assessment.service';
import { createSystemAssistant } from './system-assistant';

// Never accept a caller/model-supplied UID. Firestore rules remain the authorization boundary.
export const systemAssistantService = createSystemAssistant({
  getIdentity: () => {
    const { session, status } = useAuthStore.getState();
    if (status !== 'authenticated' || session?.role !== 'student') return null;
    if (getFirebaseAuth().currentUser?.uid !== session.uid) return null;
    return { uid: session.uid, role: session.role };
  },
  getAppointments: async uid => (await appointmentService.getStudentAppointments(uid, 'student')).map(record => ({
    studentId: record.studentId, scheduledAt: record.scheduledAt, status: record.status,
  })),
  getInProgressAssessments: async uid => (await assessmentService.getInProgressAttemptsByStudent(uid)).map(record => ({
    studentId: record.studentId, status: record.status,
  })),
});
