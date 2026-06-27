import { useEffect, useState } from 'react';
import { messagingService } from '@spartan-g/shared-services';
import { MessageBubble } from '../../components/messaging/MessageBubble';
import { MessageInput } from '../../components/messaging/MessageInput';
import { useAuth } from '../../hooks/useAuth';
import { MessageDocument } from '@spartan-g/shared-types';

interface MessageThreadProps {
  conversationId: string;
  participantId: string;
}

export function MessageThread({ conversationId, participantId }: MessageThreadProps) {
  const [messages, setMessages] = useState<(MessageDocument & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const unsubscribe = messagingService.subscribeToMessages(
      conversationId,
      user?.role || 'student',
      (updatedMessages) => {
        setMessages(updatedMessages);
        setIsLoading(false);
      },
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [conversationId, user?.role]);

  const handleSendMessage = async (body: string) => {
    if (!user) return;

    setIsSending(true);
    try {
      await messagingService.sendMessage(
        conversationId,
        user.uid,
        body,
        user.role,
      );
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg
              className="w-16 h-16 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No messages yet
            </h3>
            <p className="text-sm text-gray-500">
              Start the conversation by sending a message below.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isCurrentUser={message.senderId === user?.uid}
            />
          ))
        )}
      </div>
      <MessageInput
        onSend={handleSendMessage}
        disabled={isSending}
        placeholder="Type a message..."
      />
    </div>
  );
}