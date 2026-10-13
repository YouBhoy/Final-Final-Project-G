import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { appointmentService, messagingService, userService } from '@spartan-g/shared-services';
import { useAuth } from '../../hooks/useAuth';
import { useCampuses } from '../../hooks/useCampuses';
import {
  AppointmentDocument,
  BOOKING_WINDOW_MESSAGE,
  CAMPUS_LABELS,
  getBookingWindow,
  manilaDateTimeToMs,
  manilaMinutesOfDay,
} from '@spartan-g/shared-types';
import { AppointmentStatusBadge } from '../../components/appointments/AppointmentStatusBadge';
import { Modal } from '../../components/ui/Modal';

type Appointment = AppointmentDocument & { id: string };
type FacilitatorInfo = { name: string; campus?: string };

const UPCOMING_STATUSES = ['reschedule_requested', 'requested', 'accepted'];
const REBOOKABLE_STATUSES = ['cancelled', 'rejected', 'no_show'];

const toDate = (timestamp: any): Date | null => {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
};
const timeOf = (apt: Appointment) => toDate(apt.scheduledAt)?.getTime() ?? 0;

const formatDay = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const formatClock = (date: Date) =>
  date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// "Sep 7, 2026 · 12:00 PM – 1:00 PM"
const formatWhen = (apt: Appointment) => {
  const start = toDate(apt.scheduledAt);
  if (!start) return '';
  const end = new Date(start.getTime() + (apt.durationMinutes || 60) * 60_000);
  return `${formatDay(start)} · ${formatClock(start)} – ${formatClock(end)}`;
};

const formatTimeRange = (apt: Appointment) => {
  const start = toDate(apt.scheduledAt);
  if (!start) return '';
  const end = new Date(start.getTime() + (apt.durationMinutes || 60) * 60_000);
  return `${formatClock(start)} – ${formatClock(end)}`;
};

// Outcome notes that are empty or just punctuation (e.g. "..") count as no outcome.
const cleanOutcome = (text?: string | null) => (text && /[\p{L}\p{N}]/u.test(text) ? text.trim() : '');

const btnNeutral =
  'px-3 py-1.5 text-sm text-[var(--color-text)] border border-[var(--color-border)] rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-alt)] disabled:opacity-50 transition-colors duration-150';
const btnPrimary =
  'px-3 py-1.5 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-sm)] shadow-sm hover:bg-[var(--color-primary-light)] disabled:opacity-50 transition-all duration-150';
const btnDanger =
  'px-3 py-1.5 text-sm text-[var(--color-error)] border border-[var(--color-error)]/30 rounded-[var(--radius-sm)] hover:bg-[var(--color-error-bg)] disabled:opacity-50 transition-colors duration-150';

export function StudentAppointmentsPage() {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [facilitators, setFacilitators] = useState<{ [key: string]: FacilitatorInfo }>({});
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailsAppointment, setDetailsAppointment] = useState<Appointment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null);
  // 'YYYY-MM-DD' (Asia/Manila calendar day); restricted to today..Saturday of the current week.
  const [newDateKey, setNewDateKey] = useState<string>(() => getBookingWindow(Date.now()).startDateKey);
  const [newTime, setNewTime] = useState('09:00');
  const [rescheduleError, setRescheduleError] = useState('');
  const { user } = useAuth();
  const { campuses } = useCampuses();

  const campusLabel = (key?: string) =>
    key ? campuses.find((c) => c.key === key)?.label ?? (CAMPUS_LABELS as Record<string, string>)[key] ?? key : '';

  const loadAppointments = useCallback(async () => {
    if (!user) return;
    try {
      const data = await appointmentService.getStudentAppointments(user.uid, user.role);
      setAppointments(data);

      const info: { [key: string]: FacilitatorInfo } = {};
      for (const apt of data) {
        if (!info[apt.facilitatorId]) {
          try {
            const userDoc = await userService.getUser(apt.facilitatorId);
            if (userDoc) {
              info[apt.facilitatorId] = {
                name: userDoc.displayName || 'Unknown Facilitator',
                campus: (userDoc as any).campus,
              };
            }
          } catch { /* ignore */ }
        }
      }
      setFacilitators(info);
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
      setDetailsAppointment(null);
      await loadAppointments();
    } catch (error) {
      console.error('Failed to cancel appointment:', error);
      alert('Failed to cancel appointment. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const openRescheduleModal = (apt: Appointment) => {
    setDetailsAppointment(null);
    setRescheduleAppointment(apt);
    const aptDate = apt.scheduledAt?.toDate ? apt.scheduledAt.toDate() : new Date();
    const currentWindow = getBookingWindow(Date.now());
    // Start from today; the old date is usually outside this week. Keep the old time of day.
    setNewDateKey(currentWindow.startDateKey);
    const minutesOfDay = manilaMinutesOfDay(aptDate.getTime());
    setNewTime(`${String(Math.floor(minutesOfDay / 60)).padStart(2, '0')}:${String(minutesOfDay % 60).padStart(2, '0')}`);
    setRescheduleError('');
    setShowRescheduleModal(true);
  };

  const handleReschedule = async () => {
    if (!user || !rescheduleAppointment) return;
    setActionLoading(rescheduleAppointment.id);
    setRescheduleError('');
    try {
      const [hours, minutes] = newTime.split(':').map(Number);
      // Asia/Manila wall-clock time on the chosen day, whatever timezone the browser is in.
      const scheduledAtMs = manilaDateTimeToMs(newDateKey, hours, minutes);
      const nowMs = Date.now();
      const bookingWindow = getBookingWindow(nowMs);
      if (!newDateKey || Number.isNaN(scheduledAtMs) || scheduledAtMs < bookingWindow.startMs || scheduledAtMs >= bookingWindow.endMs) {
        setRescheduleError(BOOKING_WINDOW_MESSAGE);
        setActionLoading(null);
        return;
      }
      if (scheduledAtMs <= nowMs) {
        setRescheduleError('Please choose a time later than the current time.');
        setActionLoading(null);
        return;
      }
      const scheduledAt = new Date(scheduledAtMs);

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

  const handleMessage = async (apt: Appointment) => {
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
  };

  const handleBookAgain = (apt: Appointment) => {
    navigate(`/student/facilitator/${encodeURIComponent(apt.facilitatorId)}`);
  };

  // Upcoming: anything needing action first, then soonest first. Past: most recent first.
  const { upcoming, past } = useMemo(() => {
    const up = appointments.filter((a) => UPCOMING_STATUSES.includes(a.status));
    const done = appointments.filter((a) => !UPCOMING_STATUSES.includes(a.status));
    up.sort((a, b) => {
      const aAction = a.status === 'reschedule_requested' ? 0 : 1;
      const bAction = b.status === 'reschedule_requested' ? 0 : 1;
      if (aAction !== bAction) return aAction - bAction;
      return timeOf(a) - timeOf(b);
    });
    done.sort((a, b) => timeOf(b) - timeOf(a));
    return { upcoming: up, past: done };
  }, [appointments]);

  const completed = useMemo(() => past.filter((a) => a.status === 'completed'), [past]);
  // Cancelled, rejected and no-show sessions are grouped under "Cancelled".
  const cancelled = useMemo(() => past.filter((a) => REBOOKABLE_STATUSES.includes(a.status)), [past]);

  const list = useMemo(() => {
    const base =
      filter === 'upcoming' ? upcoming
      : filter === 'completed' ? completed
      : filter === 'cancelled' ? cancelled
      : [...upcoming, ...past];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return base;
    return base.filter((a) => (facilitators[a.facilitatorId]?.name || '').toLowerCase().includes(query));
  }, [filter, upcoming, completed, cancelled, past, searchQuery, facilitators]);

  const facilitatorLine = (apt: Appointment) => {
    const campus = campusLabel(facilitators[apt.facilitatorId]?.campus);
    return campus ? `Facilitator · ${campus}` : 'Facilitator';
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

  const sw = 'sm:w-full';

  const renderCard = (apt: Appointment, featured: boolean) => {
    const name = facilitators[apt.facilitatorId]?.name || 'Facilitator';
    const start = toDate(apt.scheduledAt);
    const isUpcoming = UPCOMING_STATUSES.includes(apt.status);
    const isActionNeeded = apt.status === 'reschedule_requested';
    const hasOutcome = apt.status === 'completed' && !!cleanOutcome(apt.outcomeNotes);
    const reason =
      apt.status === 'cancelled' ? apt.cancellationReason
      : apt.status === 'rejected' ? apt.rejectionReason
      : '';
    const reasonLabel = apt.status === 'rejected' ? 'Rejection reason' : 'Cancellation note';

    return (
      <div
        key={apt.id}
        className={`flex flex-col gap-4 rounded-[var(--radius-lg)] bg-[var(--color-surface)] border p-4 shadow-card sm:flex-row sm:p-5 ${
          featured ? 'border-[var(--color-primary)]/40' : 'border-[var(--color-border)]'
        }`}
      >
        {/* Date block */}
        <div
          className={`flex shrink-0 items-baseline gap-2 rounded-[var(--radius-md)] px-3 py-2 sm:w-20 sm:flex-col sm:items-center sm:justify-center sm:gap-0 ${
            isUpcoming
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'bg-[var(--color-bg-alt)] text-[var(--color-text-secondary)]'
          }`}
        >
          <span className="text-xs font-bold uppercase tracking-wide">
            {start ? start.toLocaleDateString('en-US', { month: 'short' }) : ''}
          </span>
          <span className="text-2xl font-bold leading-none sm:text-3xl sm:my-0.5">{start ? start.getDate() : ''}</span>
          <span className="text-xs">{start ? start.getFullYear() : ''}</span>
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1">
          {featured && (
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-primary)]">
              {isActionNeeded ? 'Action needed' : 'Next appointment'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--color-text)]">{name}</h3>
            <AppointmentStatusBadge status={apt.status} />
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">{facilitatorLine(apt)}</p>
          <p className="mt-2 text-base font-medium text-[var(--color-text)]">{formatTimeRange(apt)}</p>

          {apt.notes && (
            <p className="mt-2 text-sm italic text-[var(--color-text-secondary)]">Your note: {apt.notes}</p>
          )}
          {reason && (
            <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-2 text-sm text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text)]">{reasonLabel}:</span> {reason}
            </div>
          )}
          {isActionNeeded && apt.rescheduleReason && (
            <div className="mt-2 p-2 bg-[var(--color-warning-bg)] border border-[var(--color-warning)]/20 rounded-[var(--radius-sm)] text-sm text-[var(--color-warning)]">
              <span className="font-medium">Facilitator requested reschedule:</span> {apt.rescheduleReason}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 sm:w-40 sm:shrink-0 sm:flex-col sm:justify-center">
          {isActionNeeded && (
            <button onClick={() => openRescheduleModal(apt)} disabled={actionLoading === apt.id} className={`${btnPrimary} ${sw}`}>
              Reschedule
            </button>
          )}
          {isUpcoming && (
            <>
              <button onClick={() => handleMessage(apt)} className={`${btnNeutral} ${sw}`}>Message</button>
              <button onClick={() => setDetailsAppointment(apt)} className={`${btnNeutral} ${sw}`}>View Details</button>
            </>
          )}
          {apt.status === 'completed' && (
            <>
              <button onClick={() => setDetailsAppointment(apt)} className={`${btnNeutral} ${sw}`}>
                {hasOutcome ? 'View Outcome' : 'View Details'}
              </button>
              <button onClick={() => handleMessage(apt)} className={`${btnNeutral} ${sw}`}>Message</button>
            </>
          )}
          {REBOOKABLE_STATUSES.includes(apt.status) && (
            <>
              <button onClick={() => setDetailsAppointment(apt)} className={`${btnNeutral} ${sw}`}>View Details</button>
              <button onClick={() => handleBookAgain(apt)} className={`${btnPrimary} ${sw}`}>Book Again</button>
            </>
          )}
        </div>
      </div>
    );
  };

  const details = detailsAppointment;
  const detailsOutcome = details ? cleanOutcome(details.outcomeNotes) : '';
  const detailsReason = details
    ? details.status === 'cancelled' ? details.cancellationReason
      : details.status === 'rejected' ? details.rejectionReason
      : ''
    : '';

  const filters = [
    ['all', 'All', appointments.length],
    ['upcoming', 'Upcoming', upcoming.length],
    ['completed', 'Completed', completed.length],
    ['cancelled', 'Cancelled', cancelled.length],
  ] as const;

  const emptyCopy: Record<typeof filter, [string, string]> = {
    all: ['No appointments found', 'Nothing matches your search.'],
    upcoming: ['No upcoming appointments', 'Book a session with a facilitator and it will show up here.'],
    completed: ['No completed sessions yet', 'Sessions you have finished will show up here.'],
    cancelled: ['No cancelled appointments', 'Cancelled or declined appointments will show up here.'],
  };
  const trimmedQuery = searchQuery.trim();

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Heading */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[var(--color-text)]">My Appointments</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">View and manage your facilitator sessions.</p>
        </div>
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">
          {appointments.length} session{appointments.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Summary */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {([
          ['Upcoming', upcoming.length, 'text-[var(--color-primary)]'],
          ['Completed', completed.length, 'text-[var(--color-text)]'],
          ['Cancelled', cancelled.length, 'text-[var(--color-text)]'],
        ] as const).map(([label, n, color]) => (
          <div key={label} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-card">
            <p className={`text-2xl font-bold leading-tight ${color}`}>{n}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist">
          {filters.map(([key, label, n]) => (
            <button
              key={key}
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'bg-[var(--color-bg-alt)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
            >
              {label} ({n})
            </button>
          ))}
        </div>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by facilitator name..."
          aria-label="Search appointments by facilitator name"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 sm:w-72"
        />
      </div>

      {list.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] shadow-card border border-[var(--color-border)] p-8 text-center">
          <h3 className="mb-1 text-base font-semibold text-[var(--color-text)]">
            {trimmedQuery ? 'No appointments found' : emptyCopy[filter][0]}
          </h3>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {trimmedQuery ? `No appointments match "${trimmedQuery}".` : emptyCopy[filter][1]}
          </p>
          {trimmedQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-5 inline-flex px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] shadow-sm transition-all duration-150 hover:bg-[var(--color-primary-light)]"
            >
              Clear search
            </button>
          ) : filter === 'upcoming' ? (
            <a
              href="/student/facilitators"
              className="mt-5 inline-flex px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-[var(--radius-md)] shadow-sm transition-all duration-150 hover:bg-[var(--color-primary-light)]"
            >
              Find a Facilitator
            </a>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((apt, index) =>
            renderCard(apt, index === 0 && (filter === 'all' || filter === 'upcoming') && UPCOMING_STATUSES.includes(apt.status)),
          )}
        </div>
      )}

      {/* Appointment Details Modal */}
      <Modal
        open={!!details}
        onClose={() => setDetailsAppointment(null)}
        title="Appointment Details"
        size="md"
      >
        {details && (
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-[var(--color-text)]">
                  {facilitators[details.facilitatorId]?.name || 'Facilitator'}
                </h3>
                <AppointmentStatusBadge status={details.status} />
              </div>
              <p className="text-sm text-[var(--color-text-secondary)]">{facilitatorLine(details)}</p>
            </div>

            <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-alt)] p-3 text-sm text-[var(--color-text)]">
              <p className="font-medium">{toDate(details.scheduledAt) ? formatDay(toDate(details.scheduledAt)!) : ''}</p>
              <p className="text-[var(--color-text-secondary)]">
                {formatWhen(details).split(' · ')[1]} ({details.durationMinutes || 60} minutes)
              </p>
            </div>

            {details.notes && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Note</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{details.notes}</p>
              </div>
            )}

            {details.status === 'reschedule_requested' && details.rescheduleReason && (
              <div className="p-2 bg-[var(--color-warning-bg)] border border-[var(--color-warning)]/20 rounded-[var(--radius-sm)] text-sm text-[var(--color-warning)]">
                <span className="font-medium">Facilitator requested reschedule:</span> {details.rescheduleReason}
              </div>
            )}

            {detailsReason && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {details.status === 'rejected' ? 'Rejection reason' : 'Cancellation note'}
                </p>
                <p className="text-sm text-[var(--color-text-secondary)]">{detailsReason}</p>
              </div>
            )}

            {details.status === 'completed' && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Outcome</p>
                <p className={`text-sm ${detailsOutcome ? 'text-[var(--color-text-secondary)]' : 'italic text-[var(--color-text-muted)]'}`}>
                  {detailsOutcome || 'No outcome recorded'}
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {details.status === 'requested' && (
                <button onClick={() => handleCancel(details.id)} disabled={actionLoading === details.id} className={btnDanger}>
                  Cancel Appointment
                </button>
              )}
              {details.status === 'reschedule_requested' && (
                <button onClick={() => openRescheduleModal(details)} className={btnPrimary}>Reschedule</button>
              )}
              {REBOOKABLE_STATUSES.includes(details.status) && (
                <button onClick={() => handleBookAgain(details)} className={btnPrimary}>Book Again</button>
              )}
              <button onClick={() => handleMessage(details)} className={btnNeutral}>Message</button>
            </div>
          </div>
        )}
      </Modal>

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
              value={newDateKey}
              onChange={e => setNewDateKey(e.target.value)}
              min={getBookingWindow(Date.now()).startDateKey}
              max={getBookingWindow(Date.now()).endDateKey}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">Rescheduling is limited to the current week (today through Saturday).</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Time</label>
            <input
              type="time"
              step={1800}
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
