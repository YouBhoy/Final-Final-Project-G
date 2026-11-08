import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { messagingService } from '@spartan-g/shared-services';
import { MessageBubble } from '../../components/messaging/MessageBubble';
import { DateSeparator } from '../../components/messaging/DateSeparator';
import { MessageInput } from '../../components/messaging/MessageInput';
import { buildThreadItems, type PendingMessage } from '../../lib/messageStatus';
import { useAuth } from '../../hooks/useAuth';
import { useMessageIdentityConfirmation } from '../../hooks/useMessageIdentityConfirmation';
import { MessageDocument } from '@spartan-g/shared-types';

interface MessageThreadProps {
  conversationId: string;
  participantId: string;
}

/** True while this tab is visible and focused, so incoming messages are really on screen. */
function isConversationInView() {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());
}

let pendingCounter = 0;

export function MessageThread({ conversationId, participantId }: MessageThreadProps) {
  const [messages, setMessages] = useState<(MessageDocument & { id: string })[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [isViewing, setIsViewing] = useState(isConversationInView);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [subscriptionKey, setSubscriptionKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const { requestConfirmation, confirmation } = useMessageIdentityConfirmation(conversationId, participantId);
  const markedMessageIdsRef = useRef<Set<string>>(new Set());
  const activeConversationRef = useRef(conversationId);
  activeConversationRef.current = conversationId;
  const stickToBottomRef = useRef(true);

  // Track tab visibility/focus: messages are only marked read while they can actually be seen.
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const update = () => setIsViewing(isConversationInView());
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
    };
  }, []);

  useEffect(() => {
    markedMessageIdsRef.current.clear();
    setMessages([]);
    setPending([]);
    stickToBottomRef.current = true;
    setIsLoading(true);
    setError(null);
    setSendError(null);
  }, [conversationId]);

  const items = useMemo(
    () => buildThreadItems(messages, pending, user?.uid),
    [messages, pending, user?.uid],
  );

  // Open at the newest message, and follow new ones: always for my own sends, and for
  // incoming messages only while the reader is already near the bottom.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const lastItem = items[items.length - 1];
  const lastItemKey = lastItem ? lastItem.key : '';
  const lastItemIsOwn = lastItem?.kind === 'message' && lastItem.own;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && (stickToBottomRef.current || lastItemIsOwn)) {
      el.scrollTop = el.scrollHeight;
      stickToBottomRef.current = true;
    }
  }, [lastItemKey, lastItemIsOwn, isLoading, conversationId]);

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

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [conversationId, subscriptionKey, user?.role, user?.uid]);

  // Opening the conversation resets its unread badge, but only while it is actually in view.
  useEffect(() => {
    if (!user || !isViewing) return;
    void messagingService.markConversationAsRead(conversationId, user.uid, user.role).catch((readError) => {
      console.error('Failed to mark conversation as read:', readError);
    });
  }, [conversationId, isViewing, user?.role, user?.uid]);

  useEffect(() => {
    if (!user || isLoading || !isViewing) {
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
    ).then(() => {
      // Messages that arrive while the chat is open must also clear the list badge.
      if (activeConversationRef.current === conversationId) {
        return messagingService.markConversationAsRead(conversationId, user.uid, user.role);
      }
    }).catch((readError) => {
      console.error('Failed to mark messages as read:', readError);
    });
  }, [messages, isLoading, isViewing, user]);

  // Drop pending bubbles once the real message has arrived in the snapshot.
  useEffect(() => {
    if (pending.length === 0) return;
    const ids = new Set(messages.map((message) => message.id));
    if (pending.some((p) => p.serverId && ids.has(p.serverId))) {
      setPending((current) => current.filter((p) => !(p.serverId && ids.has(p.serverId))));
    }
  }, [messages, pending]);

  /**
   * Optimistic send: the bubble shows immediately with the "sending" icon, becomes "sent"
   * once the server confirms, and "failed" (with a retry) if the write is rejected.
   * Sends are independent, so typing fast never blocks the input.
   */
  const dispatchSend = useCallback((body: string, tempId: string) => {
    if (!user) return;
    const sendingIn = conversationId;
    const update = (change: Partial<PendingMessage>) => {
      if (activeConversationRef.current !== sendingIn) return;
      setPending((current) => current.map((p) => (p.tempId === tempId ? { ...p, ...change } : p)));
    };
    messagingService
      .sendMessage(
        conversationId,
        user.uid,
        body,
        user.role,
        undefined,
        user.role === 'student' ? participantId : undefined,
      )
      .then((serverId) => update({ serverId: typeof serverId === 'string' ? serverId : undefined, state: 'sending' }))
      .catch((sendFailure) => {
        console.error('Failed to send message:', sendFailure);
        update({ state: 'failed' });
      });
  }, [conversationId, participantId, user]);

  const handleSendMessage = async (body: string): Promise<boolean> => {
    if (!user) return false;

    setSendError(null);
    if (!await requestConfirmation()) return false;

    const tempId = `pending-${Date.now()}-${++pendingCounter}`;
    setPending((current) => [...current, { tempId, body, state: 'sending', createdAtMs: Date.now() }]);
    dispatchSend(body, tempId);
    return true;
  };

  const handleRetry = async (tempId: string) => {
    const failed = pending.find((p) => p.tempId === tempId);
    if (!failed || !user) return;
    // A student's identity-sharing consent is saved with the send, so re-confirm if needed.
    if (!await requestConfirmation()) return;
    setPending((current) => current.map((p) => (p.tempId === tempId ? { ...p, state: 'sending' } : p)));
    dispatchSend(failed.body, tempId);
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {items.length === 0 ? (
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
          items.map((item) =>
            item.kind === 'separator' ? (
              <DateSeparator key={item.key} label={item.label} />
            ) : (
              <MessageBubble
                key={item.key}
                message={item.message}
                isCurrentUser={item.own}
                status={item.status}
                showStatusLabel={item.isLastOwn}
                onRetry={item.tempId ? () => void handleRetry(item.tempId as string) : undefined}
              />
            ),
          )
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
        placeholder="Type a message..."
      />
      {confirmation}
    </div>
  );
}
