import { MessageStatusIcon } from './MessageStatusIcon';
import { statusText, toDate, formatClock, type DeliveryStatus } from '../../lib/messageStatus';

interface MessageBubbleProps {
  message: {
    id: string;
    body: string;
    createdAt?: any;
    readAt?: any;
  };
  isCurrentUser: boolean;
  /** Delivery status; only shown on messages sent by the current user. */
  status?: DeliveryStatus | null;
  /** Show the "Sent / Delivered / Read · 9:05 PM" label under this (the newest own) message. */
  showStatusLabel?: boolean;
  /** Called when the user taps "Tap to retry" on a failed message. */
  onRetry?: () => void;
}

export function MessageBubble({ message, isCurrentUser, status, showStatusLabel, onRetry }: MessageBubbleProps) {
  const sentAt = toDate(message.createdAt);
  const showStatus = isCurrentUser && status;

  return (
    <div className={`mb-3 flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[80%] px-4 py-2 sm:max-w-[70%] ${
          isCurrentUser
            ? 'rounded-2xl rounded-br-md bg-[var(--color-primary)] text-white'
            : 'rounded-2xl rounded-bl-md bg-[var(--color-bg-alt)] text-[var(--color-text)]'
        }`}
      >
        <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
        <p
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            isCurrentUser ? 'text-white/70' : 'text-[var(--color-text-muted)]'
          }`}
        >
          <span>{sentAt ? formatClock(sentAt) : ''}</span>
          {showStatus ? <MessageStatusIcon status={status} /> : null}
        </p>
      </div>

      {showStatus && status === 'failed' ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 text-[11px] font-semibold text-[var(--color-error)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-error)]"
        >
          Tap to retry
        </button>
      ) : showStatus && showStatusLabel ? (
        <p aria-live="polite" className="mt-1 pr-1 text-[11px] text-[var(--color-text-muted)]">
          {statusText(status, message.readAt)}
        </p>
      ) : null}
    </div>
  );
}
