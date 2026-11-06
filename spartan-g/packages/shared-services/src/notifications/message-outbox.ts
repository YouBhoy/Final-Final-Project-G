/** Immutable capture metadata, not an authorization or a notification payload.
 * The paired Rules and canonical backend checks decide who may write/receive.
 * Kept outside active writers until their atomic Rules rollout is approved. */
export const MESSAGE_OUTBOX_COLLECTION = 'notification_outbox' as const;
export const messageOutboxId = (messageId: string) => 'message_' + messageId;
export function messageOutbox<T>(messageId: string, conversationId: string, senderId: string, createdAt: T) {
  return { schemaVersion: 1 as const, kind: 'message.created' as const,
    messageId, conversationId, senderId, createdAt };
}
