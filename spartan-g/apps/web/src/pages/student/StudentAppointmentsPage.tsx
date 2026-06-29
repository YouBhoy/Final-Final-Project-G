import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { appointmentService, userService, messagingService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { AppointmentDocument } from '@spartan-g/shared-types';
import { AppointmentStatusBadge } from '../../components/appointments/AppointmentStatusBadge';

const STATUS_ORDER = ['requested', 'accepted', 'completed', 'cancelled', 'rejected', 'no_show'];

export function StudentAppointmentsPage() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<(AppointmentDocument & { id: string })[]>([]);
  const [facilitatorNames, setFacilitatorNames] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { user } = useAuth();

  const loadAppointments = useCallback(async () => {
    if (!user) return;
    try {
      const data = await appointmentService.getStudentAppointments(user.uid, user.role);
      data.sort((a, b) => {
        const aIdx = STATUS_ORDER.indexOf(a.status);
        const bIdx = STATUS_ORDER.indexOf(b.status);
        if (aIdx !== bIdx) return aIdx - bIdx;
        const aTime = a.scheduledAt?.toDate?.()?.getTime() || 0;
        const bTime = b.scheduledAt?.toDate?.()?.getTime() || 0;
        return bTime - aTime;
      });
      setAppointments(data);

      const names: { [key: string]: string } = {};
      for (const apt of data) {
        if (!names[apt.facilitatorId]) {
          try {
            const userDoc = await userService.getUser(apt.facilitatorId);
            if (userDoc) names[apt.facilitatorId] = userDoc.displayName || 'Unknown Facilitator';
          } catch { /* ignore */ }
        }
      }
      setFacilitatorNames(names);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleCancel = async (appointmentId: string) => {
    if (!user) return;
    if (!confirm('Are you sure you want to cancel this appointment?')) return;
    setActionLoading(appointmentId);
    try {
      await appointmentService.cancelAppointment(appointmentId, user.role, user.uid);
      await loadAppointments();
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
      alert('Failed to cancel appointment. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading appointments...</div>;
  }

  if (appointments.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <svg className="w-20 h-20 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Appointments</h3>
          <p className="text-sm text-gray-500 mb-6">
            You haven't booked any appointments yet. Browse facilitators to find someone to talk to.
          </p>
          <a
            href="/student/facilitators"
            className="inline-flex px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            Find a Facilitator
          </a>
        </div>
      </div>
    );
  }

  const handleMessageFacilitator = async (facilitatorId: string) => {
    if (!user) return;
    try {
      const conversationId = [facilitatorId, user.uid].sort().join('_');
      // Try to navigate to messages - conversation will be created if needed
      navigate(`/student/messages`);
    } catch (error) {
      console.error('Failed to open messages:', error);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">My Appointments</h1>
      <div className="space-y-3">
        {appointments.map(apt => (
          <div key={apt.id} className="bg-white border rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-gray-900">
                    {facilitatorNames[apt.facilitatorId] || 'Facilitator'}
                  </h3>
                  <AppointmentStatusBadge status={apt.status} />
                </div>
                <p className="text-sm text-gray-500">{formatDateTime(apt.scheduledAt)}</p>
                <p className="text-xs text-gray-400">{apt.durationMinutes} minutes</p>
                {apt.notes && (
                  <p className="text-sm text-gray-600 mt-2 italic">Note: {apt.notes}</p>
                )}
                {apt.outcomeNotes && apt.status === 'completed' && (
                  <p className="text-sm text-gray-600 mt-2">
                    <span className="font-medium">Outcome:</span> {apt.outcomeNotes}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {apt.status === 'requested' && (
                  <button
                    onClick={() => handleCancel(apt.id)}
                    disabled={actionLoading === apt.id}
                    className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => handleMessageFacilitator(apt.facilitatorId)}
                  className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                >
                  Message
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}