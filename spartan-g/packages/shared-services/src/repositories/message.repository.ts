import { COLLECTIONS, MessageDocument } from '@spartan-g/shared-types';
import { where, orderBy } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class MessageRepository extends BaseRepository<MessageDocument> {
  constructor() {
    super(COLLECTIONS.MESSAGES);
  }

  async getByConversation(conversationId: string) {
    return this.getAll([
      where('conversationId', '==', conversationId),
      orderBy('createdAt', 'asc'),
    ]);
  }
}

export const messageRepository = new MessageRepository();
