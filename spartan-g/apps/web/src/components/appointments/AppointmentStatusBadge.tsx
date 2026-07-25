type AppointmentStatus = 'requested' | 'accepted' | 'completed' | 'cancelled' | 'rejected' | 'no_show' | 'reschedule_requested';

interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  requested: { color: 'bg-amber-100 text-amber-800', label: 'Requested' },
  accepted: { color: 'bg-blue-100 text-blue-800', label: 'Accepted' },
  completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
  cancelled: { color: 'bg-red-100 text-red-800', label: 'Cancelled' },
  rejected: { color: 'bg-slate-100 text-slate-600', label: 'Rejected' },
  no_show: { color: 'bg-purple-100 text-purple-800', label: 'No Show' },
  reschedule_requested: { color: 'bg-amber-100 text-amber-800', label: 'Reschedule Requested' },
};

export function AppointmentStatusBadge({ status }: AppointmentStatusBadgeProps) {
  const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}