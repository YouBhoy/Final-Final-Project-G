import { useEffect, useState, useCallback } from 'react';
import { appointmentService } from '@spartan-g/shared-services';
import { userService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { AppointmentDocument } from '@spartan-g/shared-types';
import { AppointmentStatusBadge } from '../../components/appointments/AppointmentStatusBadge';

export function FacilitatorAppointmentsPage() {
  const [appointments, setAppointments] = useState<(AppointmentDocument & { id: string })[]>([]);
  const [studentNames, setStudentNames] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<(AppointmentDocument & { id: string }) | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [facilitatorNotes, setFacilitatorNotes] = useState('');
  const { user } = useAuth();

  const loadAppointments = useCallback(async () => {
    if (!user) return;
    try {
      const data = await appointmentService.getAppointments(user.uid, user.role);
      setAppointments(data);
      
      const names: { [key: string]: string } = {};
      for (const apt of data) {
        if (!names[apt.studentId]) {
          try {
            const userDoc = await userService.getUser(apt.studentId);
            if (userDoc) names[apt.studentId] = userDoc.displayName || 'Unknown Student';
          } catch { /* ignore */ }
        }
      }
      setStudentNames(names);
    } catch (error) {
      console.error('Failed to load appointments:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleAction = async (action: string, appointmentId: string) => {
    if (!user) return;
    setActionLoading(appointmentId);
    try {
      switch (action) {
        case 'accept':
          await appointmentService.acceptAppointment(appointmentId, user.uid, user.role);
          break;
        case 'reject':
          await appointmentService.rejectAppointment(appointmentId, user.uid, user.role);
          break;
        case 'complete':
          if (!outcomeNotes.trim()) { alert('Please enter outcome notes'); return; }
          await appointmentService.completeAppointment(appointmentId, user.uid, outcomeNotes, user.role);
          setOutcomeNotes('');
          setSelectedAppointment(null);
          break;
        case 'no-show':
          await appointmentService.markNoShow(appointmentId, user.uid, user.role);
          break;
        case 'cancel':
          await appointmentService.cancelAppointment(appointmentId, user.role, user.uid);
          break;
      }
      await loadAppointments();
    } catch (error) {
      console.error(`Failed to ${action} appointment:`, error);
      alert(`Failed to ${action} appointment. Please try again.`);
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

  const pendingRequests = appointments.filter(a => a.status === 'requested');
  const upcoming = appointments.filter(a => a.status === 'accepted');
  const history = appointments.filter(a => ['completed', 'cancelled', 'rejected', 'no_show'].includes(a.status));

  return (
    <div className="space-y-6">
      {/* Pending Requests */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Appointment Requests ({pendingRequests.length})
        </h2>
        {pendingRequests.length === 0 ? (
          <p className="text-sm text-gray-500">No pending appointment requests.</p>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map(apt => (
              <div key={apt.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{studentNames[apt.studentId] || 'Student'}</p>
                    <p className="text-sm text-gray-500">{formatDateTime(apt.scheduledAt)}</p>
                    <p className="text-xs text-gray-400">{apt.durationMinutes} minutes</p>
                  </div>
                  <AppointmentStatusBadge status={apt.status} />
                </div>
                {apt.notes && (
                  <p className="text-sm text-gray-600 mb-3 italic">"{apt.notes}"</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction('accept', apt.id)}
                    disabled={actionLoading === apt.id}
                    className="px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-400"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleAction('reject', apt.id)}
                    disabled={actionLoading === apt.id}
                    className="px-4 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:bg-gray-400"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => { setSelectedAppointment(apt); setFacilitatorNotes(apt.facilitatorNotes || ''); }}
                    className="px-4 py-1.5 text-gray-700 text-sm border rounded hover:bg-gray-50"
                  >
                    Notes
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500">No upcoming appointments.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map(apt => (
              <div key={apt.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{studentNames[apt.studentId] || 'Student'}</p>
                    <p className="text-sm text-gray-500">{formatDateTime(apt.scheduledAt)}</p>
                    <p className="text-xs text-gray-400">{apt.durationMinutes} minutes</p>
                  </div>
                  <AppointmentStatusBadge status={apt.status} />
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { setSelectedAppointment(apt); setOutcomeNotes(''); }}
                    className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Complete
                  </button>
                  <button
                    onClick={() => handleAction('no-show', apt.id)}
                    disabled={actionLoading === apt.id}
                    className="px-4 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 disabled:bg-gray-400"
                  >
                    No Show
                  </button>
                  <button
                    onClick={() => handleAction('cancel', apt.id)}
                    disabled={actionLoading === apt.id}
                    className="px-4 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 disabled:bg-gray-400"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setSelectedAppointment(apt); setFacilitatorNotes(apt.facilitatorNotes || ''); }}
                    className="px-4 py-1.5 text-gray-700 text-sm border rounded hover:bg-gray-50"
                  >
                    Notes
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No appointment history.</p>
        ) : (
          <div className="space-y-2">
            {history.map(apt => (
              <div key={apt.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="text-sm font-medium text-gray-900">{studentNames[apt.studentId] || 'Student'}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(apt.scheduledAt)}</p>
                </div>
                <AppointmentStatusBadge status={apt.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Complete Modal */}
      {selectedAppointment && outcomeNotes !== undefined && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setSelectedAppointment(null); setOutcomeNotes(''); }}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">
              {selectedAppointment.status === 'accepted' ? 'Complete Appointment' : 'Facilitator Notes'}
            </h3>
            {selectedAppointment.status === 'accepted' ? (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Add outcome notes for the appointment with {studentNames[selectedAppointment.studentId] || 'student'}.
                </p>
                <textarea
                  value={outcomeNotes}
                  onChange={e => setOutcomeNotes(e.target.value)}
                  placeholder="Enter outcome notes..."
                  className="w-full border rounded-lg p-3 text-sm mb-4 h-24"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setSelectedAppointment(null); setOutcomeNotes(''); }} className="px-4 py-2 text-sm text-gray-700 border rounded">Cancel</button>
                  <button onClick={() => handleAction('complete', selectedAppointment.id)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Complete</button>
                </div>
              </>
            ) : (
              <>
                <textarea
                  value={facilitatorNotes}
                  onChange={e => setFacilitatorNotes(e.target.value)}
                  placeholder="Private notes for this appointment..."
                  className="w-full border rounded-lg p-3 text-sm mb-4 h-24"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setSelectedAppointment(null)} className="px-4 py-2 text-sm text-gray-700 border rounded">Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}