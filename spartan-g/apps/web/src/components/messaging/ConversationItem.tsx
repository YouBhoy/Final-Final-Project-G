import { ConversationDocument } from '@spartan-g/shared-types';

interface ConversationItemProps {
  conversation: ConversationDocument & { id: string };
  participantNames: { [key: string]: string };
  isActive?: boolean;
  onClick: () => void;
}

export function ConversationItem({
  conversation,
  participantNames,
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

  // Get the other participant (not the current user)
  const otherParticipantId = conversation.participantIds[0];
  const otherParticipantName = participantNames[otherParticipantId] || 'Unknown User';

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
            <span className="text-xs text-gray-500 flex-shrink-0">
              {formatTime(conversation.lastMessageAt)}
            </span>
          </div>
          <p className="text-sm text-gray-600 truncate">
            {conversation.lastMessagePreview || 'No messages yet'}
          </p>
        </div>
      </div>
    </div>
  );
}