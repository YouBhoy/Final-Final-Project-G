import type { DeliveryStatus } from '../../lib/messageStatus';

interface MessageStatusIconProps {
  status: DeliveryStatus;
  /** Pixel size; the design uses 14. */
  size?: number;
  className?: string;
}

const LABELS: Record<DeliveryStatus, string> = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed to send',
};

/**
 * Colours are chosen for the maroon "sent" bubble: light pink for sending/sent/delivered
 * (delivered is slightly dimmer), light blue with a soft glow for read, and a white
 * badge with a red "!" for failed so it stays legible on maroon.
 */
const COLORS: Record<DeliveryStatus, string> = {
  sending: '#f8d7dc',
  sent: '#fde8eb',
  delivered: 'rgba(253, 232, 235, 0.72)',
  read: '#7dd3fc',
  failed: '#ffffff',
};

export function MessageStatusIcon({ status, size = 14, className }: MessageStatusIconProps) {
  const label = LABELS[status];
  const color = COLORS[status];
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    role: 'img',
    'aria-label': label,
    className: `inline-block shrink-0 align-[-2px] ${className ?? ''}`,
    style: status === 'read' ? { filter: 'drop-shadow(0 0 2px rgba(125, 211, 252, 0.95))' } : undefined,
  };

  return (
    <svg {...common} data-status={status}>
      <title>{label}</title>
      {status === 'sending' && (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.6V8l2.3 1.5" />
        </>
      )}
      {status === 'sent' && <path d="m3.5 8.6 3 3 6-6.6" />}
      {(status === 'delivered' || status === 'read') && (
        <>
          <path d="m1.5 8.6 3 3 6-6.6" />
          <path d="m7 11.2.6.6 6-6.6" />
        </>
      )}
      {status === 'failed' && (
        <>
          <circle cx="8" cy="8" r="7" fill="#ffffff" stroke="none" />
          <path d="M8 4.4v4.1" stroke="#dc2626" strokeWidth={2} />
          <circle cx="8" cy="11.4" r="0.4" fill="#dc2626" stroke="#dc2626" strokeWidth={1.2} />
        </>
      )}
    </svg>
  );
}
