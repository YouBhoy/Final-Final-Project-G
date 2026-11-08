import { useEffect, useRef } from 'react';
import { messagingService } from '@spartan-g/shared-services';
import type { Role } from '@spartan-g/shared-types';
import { useAuth } from './useAuth';

/**
 * Tells senders that their message reached this device.
 *
 * Mounted once in the portal layout, so it works on every page and while the tab is in
 * the background, which is what separates "Delivered" from "Read" (Read needs the chat
 * open and visible; see MessageThread). It watches the conversation list and, whenever the
 * newest message comes from someone else and is still "sent", marks it "delivered".
 * Offline users are caught up automatically when the realtime listener reconnects.
 */
export function useMessageDelivery() {
  const { user } = useAuth();
  const uid = user?.uid;
  const role = user?.role;
  // conversationId:lastMessageId pairs already handled, so snapshot churn never repeats work.
  const handled = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!uid || (role !== 'student' && role !== 'facilitator')) return;
    handled.current.clear();
    let active = true;

    const unsubscribe = messagingService.subscribeToConversations(
      uid,
      role as Role,
      (conversations) => {
        if (!active) return;
        for (const conversation of conversations) {
          if (!conversation.lastMessageId) continue;
          const key = `${conversation.id}:${conversation.lastMessageId}`;
          if (handled.current.has(key)) continue;
          handled.current.add(key);
          void messagingService.markConversationDelivered(conversation, uid, role as Role).catch((error) => {
            // Allow a retry on the next snapshot (e.g. a transient network error).
            handled.current.delete(key);
            console.error('[useMessageDelivery] Failed to mark messages as delivered:', error);
          });
        }
      },
      (error) => console.error('[useMessageDelivery] Conversation listener error:', error),
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, role]);
}
