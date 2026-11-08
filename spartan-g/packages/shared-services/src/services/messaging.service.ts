import { MESSAGE_OUTBOX_COLLECTION, messageOutboxId, messageOutbox } from '../notifications/message-outbox';
import {
  PERMISSIONS,
  Role,
  MessageDocument,
  ConversationDocument,
  MessageType,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import {
  serverTimestamp,
  where,
  orderBy,
  getFirestoreDb,
  collection,
  doc,
  runTransaction,
  updateDoc,
  getDocs,
  query,
  limit,
  Timestamp,
} from '../firebase/firestore';
import { conversationRepository } from '../repositories/conversation.repository';
import { messageRepository } from '../repositories/message.repository';
import { userRepository } from '../repositories/user.repository';
import { COLLECTIONS } from '@spartan-g/shared-types';
import { notificationService } from './notification.service';

/**
 * MessagingService - Core business logic for messaging.
 * 
 * All methods are platform-agnostic and can be used by:
 * - Web (React)
 * - Mobile (React Native)
 * - Desktop (Electron/Tauri)
 * 
 * Uses Firestore auto-generated IDs for messages to prevent collisions.
 * Uses transactions for atomic message + conversation updates.
 */
class MessagingService {
  private normalizeParticipantIds(participantIds: string[]) {
    return Array.from(new Set(participantIds.map((participantId) => participantId.trim()).filter(Boolean))).sort();
  }

  private validateMessageBody(body: string) {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      throw new Error('Message body cannot be empty');
    }

    if (trimmedBody.length > 4000) {
      throw new Error('Message body is too long');
    }

    return trimmedBody;
  }

  /**
   * Get all conversations for a user.
   */
  async getConversations(userId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return conversationRepository.getByParticipant(userId);
  }

  /**
   * Get all messages in a conversation.
   */
  async getMessages(conversationId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return messageRepository.getByConversation(conversationId);
  }

  /**
   * Send a message to a conversation.
   * Uses a transaction to ensure atomic message creation and conversation update.
   * Increments unread count for all other participants.
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    body: string,
    actorRole: Role,
    attachmentUrl?: string,
    identityRecipientId?: string,
  ): Promise<string> {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    const db = getFirestoreDb();
    const messageType: MessageType = attachmentUrl ? 'attachment' : 'text';
    const normalizedBody = this.validateMessageBody(body);

    try {
      // Use transaction to ensure atomic message + conversation update
      const messageRef = doc(collection(db, COLLECTIONS.MESSAGES));
      const outboxRef = doc(db, MESSAGE_OUTBOX_COLLECTION, messageOutboxId(messageRef.id));
      const conversationRef = doc(db, COLLECTIONS.CONVERSATIONS, conversationId);

      await runTransaction(db, async (transaction) => {
        // Get current conversation to update unread counts
        const convDoc = await transaction.get(conversationRef);
        if (!convDoc.exists()) {
          throw new Error(`Conversation ${conversationId} not found`);
        }

        const conversation = convDoc.data() as ConversationDocument;
        if (!conversation.participantIds.includes(senderId)) {
          throw new Error('Sender is not a participant in this conversation');
        }

        const otherParticipants = conversation.participantIds.filter(
          (id) => id !== senderId,
        );

        // The web confirmation authorizes disclosure; save it atomically with the message.
        if (identityRecipientId) {
          if (actorRole !== 'student' || otherParticipants.length !== 1 || otherParticipants[0] !== identityRecipientId) {
            throw new Error('Identity sharing must target this conversation\'s facilitator.');
          }
          transaction.set(doc(db, 'student_identity_consents', `${identityRecipientId}_${senderId}`), {
            studentId: senderId, facilitatorId: identityRecipientId, requestedAt: serverTimestamp(),
          });
        }

        // Create the message
        transaction.set(messageRef, {
          conversationId,
          senderId,
          body: normalizedBody,
          attachmentUrl: attachmentUrl || null,
          readBy: [senderId], // Sender has read their own message
          status: 'sent', // Advanced to 'delivered' / 'read' by the recipient's client
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as MessageDocument);

        // Durable metadata is committed with the message, never as a later send.
        transaction.set(outboxRef, messageOutbox(messageRef.id, conversationId, senderId, serverTimestamp()));

        // Update conversation with last message metadata
        const updateData: Partial<ConversationDocument> = {
          lastMessageAt: serverTimestamp() as unknown as Timestamp,
          lastMessagePreview: normalizedBody.slice(0, 100),
          lastMessageId: messageRef.id,
          lastMessageSenderId: senderId,
          lastMessageType: messageType,
          lastMessageStatus: 'sent',
        };

        // Increment unread count for other participants
        if (conversation.unreadCount) {
          for (const participantId of otherParticipants) {
            updateData.unreadCount = {
              ...conversation.unreadCount,
              [participantId]: (conversation.unreadCount[participantId] || 0) + 1,
            };
          }
        } else {
          // Initialize unread counts if not present
          for (const participantId of otherParticipants) {
            updateData.unreadCount = {
              [participantId]: 1,
            };
          }
        }

        transaction.update(conversationRef, updateData);
      });

      // Best-effort: create an in-app notification for the other participants
      // so they can deep-link straight into this conversation. Failures must
      // never block the message send itself.
      try {
        const conversation = await conversationRepository.getById(conversationId);
        const recipients = (conversation?.participantIds ?? []).filter((id) => id !== senderId);
        if (recipients.length > 0) {
          const sender = await userRepository.getById(senderId);
          const senderName = sender?.displayName || 'Someone';
          const preview = normalizedBody.length > 80 ? `${normalizedBody.slice(0, 80)}…` : normalizedBody;
          await Promise.all(
            recipients.map((recipientId) =>
              notificationService.createInAppNotification({
                userId: recipientId,
                title: `New message from ${senderName}`,
                body: preview,
                type: 'message',
                relatedId: conversationId,
              }),
            ),
          );
        }
      } catch (notificationError) {
        console.error('[MessagingService] Failed to create message notifications:', notificationError);
      }

      return messageRef.id;
    } catch (error: any) {
      console.error('[MessagingService] Failed to send message:', {
        conversationId,
        senderId,
        error: error.message,
      });
      throw new Error(error.message || 'Failed to send message');
    }
  }

  /**
   * Create a conversation between participants.
   * Uses Firestore auto-generated ID for the conversation document.
   */
  async createConversation(participantIds: string[], actorRole: Role): Promise<string> {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    // Sort participant IDs to create consistent conversation ID
    const normalizedParticipantIds = this.normalizeParticipantIds(participantIds);
    if (normalizedParticipantIds.length < 2) {
      throw new Error('Conversation requires at least two participants');
    }

    const id = normalizedParticipantIds.join('_');

    try {
      await conversationRepository.create(id, {
        participantIds: normalizedParticipantIds,
        lastMessageAt: serverTimestamp(),
        lastMessagePreview: '',
        unreadCount: {}, // Initialize empty unread counts
      } as ConversationDocument);

      return id;
    } catch (error: any) {
      console.error('[MessagingService] Failed to create conversation:', {
        participantIds,
        error: error.message,
      });
      throw new Error(error.message || 'Failed to create conversation');
    }
  }

  /**
   * Ensure a direct conversation exists between participants without overwriting existing metadata.
   */
  async ensureConversation(participantIds: string[], actorRole: Role): Promise<string> {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    const normalizedParticipantIds = this.normalizeParticipantIds(participantIds);
    if (normalizedParticipantIds.length < 2) {
      throw new Error('Conversation requires at least two participants');
    }

    const conversationId = normalizedParticipantIds.join('_');
    const db = getFirestoreDb();
    const conversationRef = doc(db, COLLECTIONS.CONVERSATIONS, conversationId);

    await runTransaction(db, async (transaction) => {
      const conversationDoc = await transaction.get(conversationRef);

      if (!conversationDoc.exists()) {
        transaction.set(conversationRef, {
          participantIds: normalizedParticipantIds,
          lastMessageAt: serverTimestamp(),
          lastMessagePreview: '',
          unreadCount: {},
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as ConversationDocument);
        return;
      }

      const existingConversation = conversationDoc.data() as ConversationDocument;
      const updateData: Partial<ConversationDocument> = {};

      if (!existingConversation.lastMessageAt) {
        updateData.lastMessageAt = serverTimestamp() as unknown as Timestamp;
      }

      if (existingConversation.lastMessagePreview === undefined) {
        updateData.lastMessagePreview = '';
      }

      if (!existingConversation.unreadCount) {
        updateData.unreadCount = {};
      }

      const existingParticipants = this.normalizeParticipantIds(existingConversation.participantIds || []);
      if (existingParticipants.join('_') !== normalizedParticipantIds.join('_')) {
        updateData.participantIds = normalizedParticipantIds;
      }

      if (Object.keys(updateData).length > 0) {
        transaction.update(conversationRef, updateData);
      }
    });

    return conversationId;
  }

  /**
   * Subscribe to real-time message updates in a conversation.
   */
  subscribeToMessages(
    conversationId: string,
    actorRole: Role,
    callback: (messages: (MessageDocument & { id: string })[]) => void,
    onError?: (error: Error) => void,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return messageRepository.subscribeQuery(
      [
        where('conversationId', '==', conversationId),
        orderBy('createdAt', 'asc'),
      ],
      callback,
      onError,
    );
  }

  /**
   * Subscribe to real-time conversation list updates.
   */
  subscribeToConversations(
    userId: string,
    actorRole: Role,
    callback: (conversations: (ConversationDocument & { id: string })[]) => void,
    onError?: (error: Error) => void,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return conversationRepository.subscribeQuery(
      [
        where('participantIds', 'array-contains', userId),
        orderBy('lastMessageAt', 'desc'),
      ],
      callback,
      onError,
    );
  }

  /**
   * Mark a conversation as read for a specific user.
   * Updates both the conversation's unreadCount and all unread messages.
   */
  async markConversationAsRead(
    conversationId: string,
    userId: string,
    actorRole: Role,
  ): Promise<void> {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    const db = getFirestoreDb();
    const conversationRef = doc(db, COLLECTIONS.CONVERSATIONS, conversationId);

    try {
      await runTransaction(db, async (transaction) => {
        const convDoc = await transaction.get(conversationRef);
        if (!convDoc.exists()) {
          throw new Error(`Conversation ${conversationId} not found`);
        }

        const conversation = convDoc.data() as ConversationDocument;
        if (!conversation.participantIds.includes(userId)) {
          throw new Error('User is not a participant in this conversation');
        }

        const updateData: Record<string, any> = {};

        // Reset unread count for this user
        if (conversation.unreadCount && conversation.unreadCount[userId] > 0) {
          updateData[`unreadCount.${userId}`] = 0;
        }

        // The recipient opening the conversation means the last message was read.
        if (
          conversation.lastMessageId &&
          conversation.lastMessageSenderId &&
          conversation.lastMessageSenderId !== userId &&
          conversation.lastMessageStatus !== 'read'
        ) {
          updateData.lastMessageStatus = 'read';
        }

        if (Object.keys(updateData).length > 0) {
          transaction.update(conversationRef, updateData);
        }
      });
    } catch (error: any) {
      console.error('[MessagingService] Failed to mark conversation as read:', {
        conversationId,
        userId,
        error: error.message,
      });
      throw new Error(error.message || 'Failed to mark conversation as read');
    }
  }

  /**
   * Mark a specific message as read by a user (the recipient).
   *
   * Idempotent: an already-read message is left alone, and a concurrent write from
   * another tab that wins the race is treated as success. Status only moves forward.
   */
  async markMessageAsRead(
    messageId: string,
    userId: string,
    actorRole: Role,
  ): Promise<void> {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    const db = getFirestoreDb();
    const messageRef = doc(db, COLLECTIONS.MESSAGES, messageId);

    try {
      await runTransaction(db, async (transaction) => {
        const messageDoc = await transaction.get(messageRef);
        if (!messageDoc.exists()) {
          throw new Error(`Message ${messageId} not found`);
        }
        const message = messageDoc.data() as MessageDocument;

        const conversationDoc = await transaction.get(doc(db, COLLECTIONS.CONVERSATIONS, message.conversationId));
        const participantIds = (conversationDoc.data() as ConversationDocument | undefined)?.participantIds;
        if (!participantIds?.includes(userId)) {
          throw new Error('User is not a participant in this conversation');
        }

        // Only the recipient reads a message; senders already have it in readBy.
        if (message.senderId === userId) return;
        if (message.readBy?.includes(userId) && message.status === 'read') return;

        const update: Record<string, any> = {
          readBy: message.readBy?.includes(userId) ? message.readBy : [...(message.readBy || []), userId],
          status: 'read',
          updatedAt: serverTimestamp(),
        };
        if (!message.deliveredAt) update.deliveredAt = serverTimestamp();
        if (!message.readAt) update.readAt = serverTimestamp();
        transaction.update(messageRef, update);
      });
    } catch (error: any) {
      console.error('[MessagingService] Failed to mark message as read:', {
        messageId,
        userId,
        error: error.message,
      });
      throw new Error(error.message || 'Failed to mark message as read');
    }
  }

  /**
   * Record that this user's app has received the newest messages in a conversation.
   *
   * Called by the always-mounted delivery tracker, so it works even when the recipient is
   * on another page or has the tab in the background. It never marks anything as read.
   * Safe to call repeatedly or from several tabs: each message and the conversation only
   * ever move from 'sent' to 'delivered', and a lost race is ignored.
   */
  async markConversationDelivered(
    conversation: ConversationDocument & { id: string },
    userId: string,
    actorRole: Role,
  ): Promise<void> {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    const unread = conversation.unreadCount?.[userId] ?? 0;
    const fromOther = Boolean(conversation.lastMessageSenderId) && conversation.lastMessageSenderId !== userId;
    const alreadyAdvanced = conversation.lastMessageStatus === 'delivered' || conversation.lastMessageStatus === 'read';
    if (!fromOther || unread <= 0 || alreadyAdvanced) return;

    const db = getFirestoreDb();
    const newest = await getDocs(query(
      collection(db, COLLECTIONS.MESSAGES),
      where('conversationId', '==', conversation.id),
      orderBy('createdAt', 'desc'),
      limit(Math.min(Math.max(unread, 1), 50)),
    ));

    await Promise.all(newest.docs.map(async (snapshot) => {
      const message = snapshot.data() as MessageDocument;
      if (message.senderId === userId || message.readBy?.includes(userId) || (message.status && message.status !== 'sent')) return;
      try {
        await updateDoc(snapshot.ref, {
          status: 'delivered',
          deliveredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error: any) {
        // Another tab already advanced it (rules reject a second write): that is success.
        if (error?.code !== 'permission-denied') throw error;
      }
    }));

    const conversationRef = doc(db, COLLECTIONS.CONVERSATIONS, conversation.id);
    await runTransaction(db, async (transaction) => {
      const current = await transaction.get(conversationRef);
      if (!current.exists()) return;
      const data = current.data() as ConversationDocument;
      if (
        data.lastMessageSenderId === userId ||
        data.lastMessageStatus === 'delivered' ||
        data.lastMessageStatus === 'read'
      ) {
        return;
      }
      transaction.update(conversationRef, { lastMessageStatus: 'delivered' });
    });
  }
}

export const messagingService = new MessagingService();
