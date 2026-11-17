import { ConversationDocument } from '@spartan-g/shared-types';
import { MessageStatusIcon } from './MessageStatusIcon';
import { resolveConversationStatus } from '../../lib/messageStatus';
import { Avatar } from '../ui/Avatar';

interface ConversationItemProps {
  conversation: ConversationDocument & { id: string };
  participantNames: { [key: string]: string };
  currentUserId?: string;
  isActive?: boolean;
  nameSuffix?: string;
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
  nameSuffix,
  onClick,
}: ConversationItemProps) {
  const otherParticipantId =
    conversation.participantIds.find((participantId) => participantId !== currentUserId) ||
    conversation.participantIds[0];
  const fullName = participantNames[otherParticipantId] || 'Unknown User';
  const anonymousMatch = fullName.match(/^Student[-_ ]([a-z0-9]+)/i);
  const otherParticipantName = anonymousMatch
    ? `Anonymous student · ${anonymousMatch[1].slice(0, 4).toLowerCase()}`
    : fullName;
  const unreadCount = currentUserId ? conversation.unreadCount?.[currentUserId] || 0 : 0;
  // Status of my own last message, shown before the preview text.
  const ownLastStatus = currentUserId && conversation.lastMessagePreview ? resolveConversationStatus(conversation, currentUserId) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? 'true' : undefined}
      title={fullName}
      className={`conversation-list-row flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${isActive ? 'is-active' : ''}`}
    >
      <Avatar name={otherParticipantName} size="md" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className={`conversation-contact-name truncate ${unreadCount > 0 ? 'font-bold' : 'font-semibold'}`} title={fullName}>
            {otherParticipantName}{nameSuffix ? <span className="conversation-name-suffix"> · {nameSuffix}</span> : null}
          </h3>
          <time className="conversation-list-time shrink-0">
            {formatListTime(conversation.lastMessageAt)}
          </time>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={`conversation-list-preview flex min-w-0 items-center gap-1 truncate ${
              unreadCount > 0
                ? 'font-bold text-[var(--color-text)]'
                : ''
            }`}
          >
            {ownLastStatus ? (
              <MessageStatusIcon status={ownLastStatus} size={12} className="conversation-receipt-icon" />
            ) : null}
            <span className="truncate">{conversation.lastMessagePreview || 'No messages yet'}</span>
          </p>
          {unreadCount > 0 ? (
            <span
              className="conversation-unread-count inline-flex min-w-5 shrink-0 justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
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
