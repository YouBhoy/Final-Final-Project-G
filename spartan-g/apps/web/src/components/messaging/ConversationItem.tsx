import { ConversationDocument } from '@spartan-g/shared-types';

interface ConversationItemProps {
  conversation: ConversationDocument & { id: string };
  participantNames: { [key: string]: string };
  currentUserId?: string;
  isActive?: boolean;
  onClick: () => void;
}

export function ConversationItem({
  conversation,
  participantNames,
  currentUserId,
  isActive = false,
  onClick,
}: ConversationItemProps) {
  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const otherParticipantId =
    conversation.participantIds.find((participantId) => participantId !== currentUserId) ||
    conversation.participantIds[0];
  const otherParticipantName = participantNames[otherParticipantId] || 'Unknown User';
  const unreadCount = currentUserId ? conversation.unreadCount?.[currentUserId] || 0 : 0;

  return (
    <div
      onClick={onClick}
      className={`p-4 border-b cursor-pointer transition-colors hover:bg-gray-50 ${
        isActive ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {otherParticipantName}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              {unreadCount > 0 ? (
                <span className="inline-flex min-w-5 justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
              <span className="text-xs text-gray-500">
                {formatTime(conversation.lastMessageAt)}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-600 truncate">
            {conversation.lastMessagePreview || 'No messages yet'}
          </p>
        </div>
      </div>
    </div>
  );
}