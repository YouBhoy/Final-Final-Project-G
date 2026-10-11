import { useEffect, useRef, useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [subscriptionKey, setSubscriptionKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const markedMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    markedMessageIdsRef.current.clear();
    setMessages([]);
    setIsLoading(true);
    setError(null);
    setSendError(null);
  }, [conversationId]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, isLoading]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = messagingService.subscribeToMessages(
      conversationId,
      user.role,
      (updatedMessages) => {
        setMessages(updatedMessages);
        setIsLoading(false);
        setError(null);
      },
      (listenerError) => {
        console.error('Failed to subscribe to messages:', listenerError);
        setError(listenerError.message || 'Failed to load messages');
        setIsLoading(false);
      },
    );

    void messagingService.markConversationAsRead(conversationId, user.uid, user.role).catch((readError) => {
      console.error('Failed to mark conversation as read:', readError);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [conversationId, subscriptionKey, user?.role, user?.uid]);

  useEffect(() => {
    if (!user || isLoading) {
      return;
    }

    const unreadMessages = messages.filter(
      (message) =>
        message.senderId !== user.uid &&
        !message.readBy?.includes(user.uid) &&
        !markedMessageIdsRef.current.has(message.id),
    );

    if (unreadMessages.length === 0) {
      return;
    }

    unreadMessages.forEach((message) => {
      markedMessageIdsRef.current.add(message.id);
    });

    void Promise.all(
      unreadMessages.map((message) => messagingService.markMessageAsRead(message.id, user.uid, user.role)),
    ).catch((readError) => {
      console.error('Failed to mark messages as read:', readError);
    });
  }, [messages, isLoading, user]);

  const handleSendMessage = async (body: string): Promise<boolean> => {
    if (!user) return false;

    setIsSending(true);
    setSendError(null);
    try {
      await messagingService.sendMessage(
        conversationId,
        user.uid,
        body,
        user.role,
      );
      return true;
    } catch (sendError) {
      console.error('Failed to send message:', sendError);
      setSendError('Your message could not be sent. Please try again.');
      return false;
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
          <p className="text-sm text-[var(--color-text-secondary)]">Loading messages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <h3 className="text-base font-semibold text-[var(--color-text)] mb-1">Unable to load messages</h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">{error}</p>
        <button
          type="button"
          onClick={() => setSubscriptionKey((value) => value + 1)}
          className="px-4 py-2 text-sm font-medium bg-[var(--color-primary)] text-white rounded-[var(--radius-md)] shadow-sm hover:bg-[var(--color-primary-light)] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg
              className="w-12 h-12 text-[var(--color-text-muted)] mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
            <h3 className="text-base font-semibold text-[var(--color-text)] mb-1">
              No messages yet
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
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
      {sendError && (
        <div
          role="alert"
          className="mx-3 mb-0 rounded-[var(--radius-sm)] border border-[var(--color-error)]/20 bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error)] sm:mx-4"
        >
          {sendError}
        </div>
      )}
      <MessageInput
        onSend={handleSendMessage}
        disabled={isSending}
        isSending={isSending}
        placeholder="Type a message..."
      />
    </div>
  );
}