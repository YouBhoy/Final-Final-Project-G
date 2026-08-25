import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { appointmentService, messagingService, userService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { AppointmentDocument } from '@spartan-g/shared-types';
import { AppointmentStatusBadge } from '../../components/appointments/AppointmentStatusBadge';
import { Modal } from '../../components/ui/Modal';

const STATUS_ORDER = ['reschedule_requested', 'requested', 'accepted', 'completed', 'cancelled', 'rejected', 'no_show'];

export function StudentAppointmentsPage() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<(AppointmentDocument & { id: string })[]>([]);
  const [facilitatorNames, setFacilitatorNames] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<(AppointmentDocument & { id: string }) | null>(null);
  const [newScheduledAt, setNewScheduledAt] = useState<Date>(new Date());
  const [newTime, setNewTime] = useState('09:00');
  const [rescheduleError, setRescheduleError] = useState('');
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

  const openRescheduleModal = (apt: (AppointmentDocument & { id: string })) => {
    setRescheduleAppointment(apt);
    const aptDate = apt.scheduledAt?.toDate ? apt.scheduledAt.toDate() : new Date();
    setNewScheduledAt(aptDate);
    const hours = String(aptDate.getHours()).padStart(2, '0');
    const mins = String(aptDate.getMinutes()).padStart(2, '0');
    setNewTime(`${hours}:${mins}`);
    setRescheduleError('');
    setShowRescheduleModal(true);
  };

  const handleReschedule = async () => {
    if (!user || !rescheduleAppointment) return;
    setActionLoading(rescheduleAppointment.id);
    setRescheduleError('');
    try {
      const [hours, minutes] = newTime.split(':').map(Number);
      const scheduledAt = new Date(newScheduledAt);
      scheduledAt.setHours(hours, minutes, 0, 0);

      await appointmentService.rescheduleAppointment(
        rescheduleAppointment.id,
        user.uid,
        scheduledAt,
        60,
        user.role,
      );

      setShowRescheduleModal(false);
      setRescheduleAppointment(null);
      await loadAppointments();
      alert('Reschedule request sent! The facilitator will be notified.');
    } catch (error: any) {
      console.error('Failed to reschedule:', error);
      setRescheduleError(error?.message || 'Failed to reschedule');
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
    return <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center space-y-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
        <p className="text-sm text-[var(--color-text-secondary)]">Loading appointments...</p>
      </div>
    </div>;
  }

  if (appointments.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] shadow-card border border-[var(--color-border)] p-8 text-center">
          <svg className="w-20 h-20 text-[var(--color-text-muted)] mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-[var(--color-text)] mb-2">No Appointments</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            You haven't booked any appointments yet. Browse facilitators to find someone to talk to.
          </p>
          <a
            href="/student/facilitators"
            className="inline-flex px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] shadow-sm transition-all duration-150 hover:bg-[var(--color-primary-light)]"
          >
            Find a Facilitator
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)] mb-6">My Appointments</h1>
      <div className="space-y-3">
        {appointments.map(apt => (
          <div key={apt.id} className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 shadow-card">
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
                {apt.status === 'reschedule_requested' && apt.rescheduleReason && (
                <div className="mt-2 p-2 bg-[var(--color-warning-bg)] border border-[var(--color-warning)]/20 rounded-[var(--radius-sm)] text-sm text-[var(--color-warning)]">
                    <span className="font-medium">Facilitator requested reschedule:</span> {apt.rescheduleReason}
                  </div>
                )}
                {apt.outcomeNotes && apt.status === 'completed' && (
                  <p className="text-sm text-gray-600 mt-2">
                    <span className="font-medium">Outcome:</span> {apt.outcomeNotes}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 ml-3">
                {(apt.status === 'requested' || apt.status === 'reschedule_requested') && (
                  <>
                    {apt.status === 'requested' && (
                      <button
                        onClick={() => handleCancel(apt.id)}
                        disabled={actionLoading === apt.id}
                className="px-3 py-1 text-sm text-[var(--color-error)] border border-[var(--color-error)]/30 rounded-[var(--radius-sm)] hover:bg-[var(--color-error-bg)] disabled:opacity-50 transition-colors duration-150"
                      >
                        Cancel
                      </button>
                    )}
                    {apt.status === 'reschedule_requested' && (
                      <button
                        onClick={() => openRescheduleModal(apt)}
                        disabled={actionLoading === apt.id}
                className="px-3 py-1 text-sm text-[var(--color-warning)] border border-[var(--color-warning)]/30 rounded-[var(--radius-sm)] hover:bg-[var(--color-warning-bg)] disabled:opacity-50 transition-colors duration-150"
                      >
                        Reschedule
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={async () => {
                    if (!user) return;

                    try {
                      const conversationId = await messagingService.ensureConversation(
                        [apt.facilitatorId, user.uid],
                        user.role,
                      );
                      navigate(`/${user.role}/messages?conversation=${encodeURIComponent(conversationId)}`);
                    } catch (error) {
                      console.error('Failed to open conversation:', error);
                      alert('Unable to open conversation. Please try again.');
                    }
                  }}
                className="px-3 py-1 text-sm text-[var(--color-info)] border border-[var(--color-info)]/30 rounded-[var(--radius-sm)] hover:bg-[var(--color-info-bg)] transition-colors duration-150"
                >
                  Message
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reschedule Modal */}
      <Modal
        open={showRescheduleModal}
        onClose={() => { setShowRescheduleModal(false); setRescheduleAppointment(null); }}
        title="Reschedule Appointment"
        description="Pick a new date and time for your appointment."
        size="md"
      >
        {rescheduleError && (
          <div className="mb-4 p-3 bg-[var(--color-error-bg)] border border-[var(--color-error)]/20 rounded-[var(--radius-sm)] text-sm text-[var(--color-error)]">
            {rescheduleError}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Date</label>
            <input
              type="date"
              value={newScheduledAt.toISOString().split('T')[0]}
              onChange={e => setNewScheduledAt(new Date(e.target.value))}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Time</label>
            <input
              type="time"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={() => { setShowRescheduleModal(false); setRescheduleAppointment(null); }}
              className="px-4 py-2 text-sm text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-[var(--radius-md)] hover:bg-[var(--color-bg-alt)] transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              onClick={handleReschedule}
              disabled={actionLoading === rescheduleAppointment?.id}
              className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] shadow-sm hover:bg-[var(--color-primary-light)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
            >
              {actionLoading === rescheduleAppointment?.id ? 'Rescheduling...' : 'Request Reschedule'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}