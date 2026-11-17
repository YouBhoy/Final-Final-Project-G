type AppointmentStatus = 'requested' | 'accepted' | 'completed' | 'cancelled' | 'rejected' | 'no_show' | 'reschedule_requested' | 'past';

interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
}

const statusConfig: Record<string, { tone: string; label: string }> = {
  requested: { tone: 'requested', label: 'Requested' },
  accepted: { tone: 'accepted', label: 'Accepted' },
  completed: { tone: 'completed', label: 'Completed' },
  cancelled: { tone: 'cancelled', label: 'Cancelled' },
  rejected: { tone: 'rejected', label: 'Rejected' },
  no_show: { tone: 'no-show', label: 'No Show' },
  reschedule_requested: { tone: 'requested', label: 'Reschedule Requested' },
  past: { tone: 'neutral', label: 'Past' },
};

export function AppointmentStatusBadge({ status }: AppointmentStatusBadgeProps) {
  const config = statusConfig[status] || { tone: 'neutral', label: status };
  return (
    <span className={`appointment-status-badge appointment-status-${config.tone}`}>
      {config.label}
    </span>
  );
}
