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

        // Create the message
        transaction.set(messageRef, {
          conversationId,
          senderId,
          body: normalizedBody,
          attachmentUrl: attachmentUrl || null,
          readBy: [senderId], // Sender has read their own message
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as MessageDocument);

        // Update conversation with last message metadata
        const updateData: Partial<ConversationDocument> = {
          lastMessageAt: serverTimestamp() as unknown as Timestamp,
          lastMessagePreview: normalizedBody.slice(0, 100),
          lastMessageId: messageRef.id,
          lastMessageSenderId: senderId,
          lastMessageType: messageType,
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

        // Reset unread count for this user
        if (conversation.unreadCount && conversation.unreadCount[userId] > 0) {
          transaction.update(conversationRef, {
            [`unreadCount.${userId}`]: 0,
          });
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
   * Mark a specific message as read by a user.
   */
  async markMessageAsRead(
    messageId: string,
    userId: string,
    actorRole: Role,
  ): Promise<void> {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    try {
      const message = await messageRepository.getById(messageId);
      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      const conversation = await conversationRepository.getById(message.conversationId);
      if (!conversation || !conversation.participantIds.includes(userId)) {
        throw new Error('User is not a participant in this conversation');
      }

      // Add user to readBy array if not already present
      if (!message.readBy?.includes(userId)) {
        await messageRepository.update(messageId, {
          readBy: [...(message.readBy || []), userId],
        } as Partial<MessageDocument>);
      }
    } catch (error: any) {
      console.error('[MessagingService] Failed to mark message as read:', {
        messageId,
        userId,
        error: error.message,
      });
      throw new Error(error.message || 'Failed to mark message as read');
    }
  }
}

export const messagingService = new MessagingService();