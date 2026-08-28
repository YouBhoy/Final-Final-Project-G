import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConversationList } from '../../components/messaging/ConversationList';
import { MessageThread } from '../messaging/MessageThread';
import { useConversationList } from '../../hooks/useConversationList';
import { useAuth } from '../../hooks/useAuth';

export function FacilitatorMessagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const { conversations, participantNames, isLoading, error, retry } = useConversationList();
  const { user } = useAuth();
  const requestedConversationId = searchParams.get('conversation');

  // Deep-link support: when arriving via a notification with ?conversation=<id>,
  // open that conversation as soon as it appears in the list.
  useEffect(() => {
    if (!requestedConversationId || activeConversationId) {
      return;
    }

    const exists = conversations.some((conversation) => conversation.id === requestedConversationId);
    if (exists) {
      setActiveConversationId(requestedConversationId);
      setSearchParams((currentParams) => {
        currentParams.delete('conversation');
        return currentParams;
      }, { replace: true });
    }
  }, [activeConversationId, conversations, requestedConversationId, setSearchParams]);

  useEffect(() => {
    if (activeConversationId && !conversations.some((conversation) => conversation.id === activeConversationId)) {
      setActiveConversationId(null);
    }
  }, [activeConversationId, conversations]);

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
  };

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeParticipantId = activeConversation?.participantIds.find(id => id !== user?.uid);

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white rounded-lg shadow-sm border">
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Conversations</h2>
        </div>
        <ConversationList
          conversations={conversations}
          participantNames={participantNames}
          currentUserId={user?.uid}
          activeConversationId={activeConversationId || undefined}
          onSelectConversation={handleSelectConversation}
          isLoading={isLoading}
          error={error}
          onRetry={retry}
        />
      </div>

      <div className="flex-1 flex flex-col">
        {activeConversationId && activeParticipantId ? (
          <>
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {participantNames[activeParticipantId] || 'Loading...'}
              </h3>
            </div>
            <MessageThread
              conversationId={activeConversationId}
              participantId={activeParticipantId}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <svg
              className="w-20 h-20 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Select a conversation
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Conversations are created automatically when you accept an appointment request.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}