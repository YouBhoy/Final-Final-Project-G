import {
  PERMISSIONS,
  Role,
  MessageDocument,
  ConversationDocument,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import { serverTimestamp } from '../firebase/firestore';
import { conversationRepository } from '../repositories/conversation.repository';
import { messageRepository } from '../repositories/message.repository';

class MessagingService {
  async getConversations(userId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return conversationRepository.getByParticipant(userId);
  }

  async getMessages(conversationId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return messageRepository.getByConversation(conversationId);
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    body: string,
    actorRole: Role,
    attachmentUrl?: string,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }

    const messageId = `${conversationId}_${Date.now()}`;
    await messageRepository.create(messageId, {
      conversationId,
      senderId,
      body,
      attachmentUrl,
      isRead: false,
      createdAt: serverTimestamp(),
    } as MessageDocument);

    await conversationRepository.update(conversationId, {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: body.slice(0, 100),
    } as Partial<ConversationDocument>);

    return messageId;
  }

  async createConversation(participantIds: string[], actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    const id = participantIds.sort().join('_');
    await conversationRepository.create(id, {
      participantIds,
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: '',
    } as ConversationDocument);
    return id;
  }

  subscribeToMessages(
    conversationId: string,
    actorRole: Role,
    callback: (messages: (MessageDocument & { id: string })[]) => void,
  ) {
    if (!hasPermission(actorRole, PERMISSIONS.SEND_MESSAGES)) {
      throw new PermissionError();
    }
    return messageRepository.subscribeQuery(
      [],
      callback,
    );
  }
}

export const messagingService = new MessagingService();
