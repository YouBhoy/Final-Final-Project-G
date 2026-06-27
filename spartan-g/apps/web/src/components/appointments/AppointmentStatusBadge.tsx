interface AppointmentStatusBadgeProps {
  status: 'requested' | 'accepted' | 'completed' | 'cancelled' | 'rejected' | 'no_show';
}

const statusConfig: Record<string, { color: string; label: string }> = {
  requested: { color: 'bg-yellow-100 text-yellow-800', label: 'Requested' },
  accepted: { color: 'bg-blue-100 text-blue-800', label: 'Accepted' },
  completed: { color: 'bg-green-100 text-green-800', label: 'Completed' },
  cancelled: { color: 'bg-red-100 text-red-800', label: 'Cancelled' },
  rejected: { color: 'bg-gray-100 text-gray-800', label: 'Rejected' },
  no_show: { color: 'bg-purple-100 text-purple-800', label: 'No Show' },
};

export function AppointmentStatusBadge({ status }: AppointmentStatusBadgeProps) {
  const config = statusConfig[status] || { color: 'bg-gray-100 text-gray-800', label: status };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}