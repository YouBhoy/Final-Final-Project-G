import { useEffect, useState, useCallback } from 'react';
import { appointmentService } from '@spartan-g/shared-services';
import { userService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { AppointmentDocument } from '@spartan-g/shared-types';
import { AppointmentStatusBadge } from '../../components/appointments/AppointmentStatusBadge';
import { Modal } from '../../components/ui/Modal';

export function FacilitatorAppointmentsPage() {
  const [appointments, setAppointments] = useState<(AppointmentDocument & { id: string })[]>([]);
  const [studentNames, setStudentNames] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<(AppointmentDocument & { id: string }) | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [facilitatorNotes, setFacilitatorNotes] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
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
        case 'reschedule':
          // Open reschedule modal instead of directly calling
          setRescheduleAppointmentId(appointmentId);
          setRescheduleReason('');
          setShowRescheduleModal(true);
          setActionLoading(null);
          return;
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
          await appointmentService.cancelAppointment(appointmentId, user.role, user.uid, 'Cancelled by facilitator');
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

  const handleRequestReschedule = async () => {
    if (!user || !rescheduleAppointmentId || !rescheduleReason.trim()) {
      alert('Please provide a reason for rescheduling');
      return;
    }
    setActionLoading(rescheduleAppointmentId);
    try {
      await appointmentService.requestReschedule(rescheduleAppointmentId, user.uid, rescheduleReason, user.role);
      setShowRescheduleModal(false);
      setRescheduleAppointmentId(null);
      setRescheduleReason('');
      await loadAppointments();
      alert('Reschedule request sent to the student.');
    } catch (error: any) {
      console.error('Failed to request reschedule:', error);
      alert(error?.message || 'Failed to request reschedule');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveNotes = async () => {
    if (!user || !selectedAppointment) return;
    try {
      await appointmentService.saveFacilitatorNotes(selectedAppointment.id, user.uid, facilitatorNotes, user.role);
      setShowNotesModal(false);
      setSelectedAppointment(null);
      alert('Notes saved successfully.');
      await loadAppointments();
    } catch (error) {
      console.error('Failed to save notes:', error);
      alert('Failed to save notes');
    }
  };

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const getStudentRequestText = (apt: AppointmentDocument) => {
    const note = apt.notes?.trim();
    if (note) return note;
    return `Requested appointment for ${formatDateTime(apt.scheduledAt)}.`;
  };

  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Loading appointments...</div>;
  }

  const pendingRequests = appointments.filter(a => a.status === 'requested');
  const upcoming = appointments.filter(a => a.status === 'accepted');
  const rescheduleRequests = appointments.filter(a => a.status === 'reschedule_requested');
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
                <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Student request</p>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{getStudentRequestText(apt)}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => handleAction('accept', apt.id)}
                    disabled={actionLoading === apt.id}
                    className="px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-400"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleAction('reschedule', apt.id)}
                    disabled={actionLoading === apt.id}
                    className="px-4 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:bg-gray-400"
                  >
                    Reschedule
                  </button>
                  <button
                    onClick={() => { setSelectedAppointment(apt); setFacilitatorNotes(apt.facilitatorNotes || ''); setShowNotesModal(true); }}
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
                <div className="flex gap-2 mt-3 flex-wrap">
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
                    onClick={() => { setSelectedAppointment(apt); setFacilitatorNotes(apt.facilitatorNotes || ''); setShowNotesModal(true); }}
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

      {/* Reschedule Requests from Students */}
      {rescheduleRequests.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Reschedule Requests ({rescheduleRequests.length})
          </h2>
          <div className="space-y-3">
            {rescheduleRequests.map(apt => (
              <div key={apt.id} className="border rounded-lg p-4 bg-amber-50">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{studentNames[apt.studentId] || 'Student'}</p>
                    <p className="text-sm text-gray-500">{formatDateTime(apt.scheduledAt)}</p>
                    <p className="text-xs text-gray-400">{apt.durationMinutes} minutes</p>
                  </div>
                  <AppointmentStatusBadge status={apt.status} />
                </div>
                {apt.rescheduleReason && (
                  <p className="text-sm text-amber-700 mb-2">
                    <span className="font-medium">Reason:</span> {apt.rescheduleReason}
                  </p>
                )}
                <p className="text-xs text-amber-600">Awaiting student to pick a new time...</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
      {selectedAppointment && outcomeNotes !== undefined && selectedAppointment.status === 'accepted' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setSelectedAppointment(null); setOutcomeNotes(''); }}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Complete Appointment</h3>
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
          </div>
        </div>
      )}

      {/* Notes Modal */}
      <Modal
        open={showNotesModal}
        onClose={() => { setShowNotesModal(false); setSelectedAppointment(null); }}
        title="Facilitator Notes"
        description="Private notes for this appointment."
        size="md"
      >
        <textarea
          value={facilitatorNotes}
          onChange={e => setFacilitatorNotes(e.target.value)}
          placeholder="Private notes for this appointment..."
          className="w-full border rounded-lg p-3 text-sm mb-4 h-32"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setShowNotesModal(false); setSelectedAppointment(null); }} className="px-4 py-2 text-sm text-gray-700 border rounded">Cancel</button>
          <button onClick={handleSaveNotes} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save Notes</button>
        </div>
      </Modal>

      {/* Reschedule Modal */}
      <Modal
        open={showRescheduleModal}
        onClose={() => { setShowRescheduleModal(false); setRescheduleAppointmentId(null); }}
        title="Request Reschedule"
        description="Provide a reason for requesting a reschedule. The student will be notified and can pick a new time."
        size="md"
      >
        <textarea
          value={rescheduleReason}
          onChange={e => setRescheduleReason(e.target.value)}
          placeholder="Explain why the appointment needs to be rescheduled..."
          className="w-full border rounded-lg p-3 text-sm mb-4 h-24"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setShowRescheduleModal(false); setRescheduleAppointmentId(null); }} className="px-4 py-2 text-sm text-gray-700 border rounded">Cancel</button>
          <button
            onClick={handleRequestReschedule}
            disabled={!rescheduleReason.trim() || actionLoading === rescheduleAppointmentId}
            className="px-4 py-2 text-sm bg-amber-600 text-white rounded hover:bg-amber-700 disabled:bg-gray-400"
          >
            {actionLoading === rescheduleAppointmentId ? 'Sending...' : 'Request Reschedule'}
          </button>
        </div>
      </Modal>
    </div>
  );
}