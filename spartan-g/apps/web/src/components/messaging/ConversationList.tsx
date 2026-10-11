import { ConversationDocument } from '@spartan-g/shared-types';
import { ConversationItem } from './ConversationItem';

interface ConversationListProps {
  conversations: (ConversationDocument & { id: string })[];
  participantNames: { [key: string]: string };
  currentUserId?: string;
  activeConversationId?: string;
  onSelectConversation: (conversationId: string) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function ConversationList({
  conversations,
  participantNames,
  currentUserId,
  activeConversationId,
  onSelectConversation,
  isLoading = false,
  error = null,
  onRetry,
}: ConversationListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[var(--color-text-secondary)]">Loading conversations...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <svg
          className="w-12 h-12 text-[var(--color-text-muted)] mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M12 8v4m0 4h.01M4.93 19h14.14a2 2 0 001.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16a2 2 0 001.73 3z"
          />
        </svg>
        <h3 className="text-base font-semibold text-[var(--color-text)] mb-2">Unable to load conversations</h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">{error}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] rounded-[var(--radius-md)] hover:bg-[var(--color-primary-light)] transition-colors"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <svg
          className="w-12 h-12 text-[var(--color-text-muted)] mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <h3 className="text-base font-semibold text-[var(--color-text)] mb-2">No conversations</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Start a new conversation by requesting support from a facilitator.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          participantNames={participantNames}
          currentUserId={currentUserId}
          isActive={conversation.id === activeConversationId}
          onClick={() => onSelectConversation(conversation.id)}
        />
      ))}
    </div>
  );
}