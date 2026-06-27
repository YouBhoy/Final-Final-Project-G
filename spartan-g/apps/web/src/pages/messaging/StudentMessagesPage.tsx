import { useEffect, useState, useCallback } from 'react';
import { messagingService } from '@spartan-g/shared-services';
import { userService } from '@spartan-g/shared-services';
import { ConversationList } from '../../components/messaging/ConversationList';
import { MessageThread } from '../messaging/MessageThread';
import { useAuth } from '../../hooks/useAuth';
import { ConversationDocument } from '@spartan-g/shared-types';

export function StudentMessagesPage() {
  const [conversations, setConversations] = useState<(ConversationDocument & { id: string })[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [participantNames, setParticipantNames] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const loadConversations = useCallback(async () => {
    if (!user) return;
    
    try {
      const userConversations = await messagingService.getConversations(user.uid, user.role);
      setConversations(userConversations);

      const names: { [key: string]: string } = {};
      for (const conv of userConversations) {
        for (const participantId of conv.participantIds) {
          if (participantId !== user.uid && !names[participantId]) {
            try {
              const userDoc = await userService.getUser(participantId);
              if (userDoc) {
                names[participantId] = userDoc.displayName || 'Unknown User';
              }
            } catch (error) {
              console.error('Failed to load user profile:', error);
            }
          }
        }
      }
      setParticipantNames(names);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
  };

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeParticipantId = activeConversation?.participantIds.find(id => id !== user?.uid);

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white rounded-lg shadow-sm border">
      <div className="w-80 border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
        </div>
        <ConversationList
          conversations={conversations}
          participantNames={participantNames}
          activeConversationId={activeConversationId || undefined}
          onSelectConversation={handleSelectConversation}
          isLoading={isLoading}
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
              Messaging is available after an appointment has been accepted by a facilitator.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}