import { ConversationDocument } from '@spartan-g/shared-types';

interface ConversationItemProps {
  conversation: ConversationDocument & { id: string };
  participantNames: { [key: string]: string };
  currentUserId?: string;
  isActive?: boolean;
  onClick: () => void;
}

// "10:30 AM" today, "Yesterday", weekday within the last week, otherwise "Sep 7".
function formatListTime(timestamp: any) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / (1000 * 60 * 60 * 24));

  if (days <= 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ConversationItem({
  conversation,
  participantNames,
  currentUserId,
  isActive = false,
  onClick,
}: ConversationItemProps) {
  const otherParticipantId =
    conversation.participantIds.find((participantId) => participantId !== currentUserId) ||
    conversation.participantIds[0];
  const otherParticipantName = participantNames[otherParticipantId] || 'Unknown User';
  const unreadCount = currentUserId ? conversation.unreadCount?.[currentUserId] || 0 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      className={`flex w-full items-center gap-3 border-b border-b-[var(--color-border)] px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)] ${
        isActive
          ? 'bg-[var(--color-primary)]/10'
          : 'hover:bg-[var(--color-primary)]/5'
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-sm font-semibold text-[var(--color-primary)]">
        {otherParticipantName.charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3
            className={`truncate text-sm text-[var(--color-text)] ${
              unreadCount > 0 ? 'font-bold' : 'font-semibold'
            }`}
          >
            {otherParticipantName}
          </h3>
          <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
            {formatListTime(conversation.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={`truncate text-sm ${
              unreadCount > 0
                ? 'font-medium text-[var(--color-text)]'
                : 'text-[var(--color-text-secondary)]'
            }`}
          >
            {conversation.lastMessagePreview || 'No messages yet'}
          </p>
          {unreadCount > 0 ? (
            <span
              className="inline-flex min-w-5 shrink-0 justify-center rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white"
              aria-label={`${unreadCount} unread`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
