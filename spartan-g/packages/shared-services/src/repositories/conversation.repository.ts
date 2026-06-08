import { COLLECTIONS, ConversationDocument } from '@spartan-g/shared-types';
import { where, orderBy } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class ConversationRepository extends BaseRepository<ConversationDocument> {
  constructor() {
    super(COLLECTIONS.CONVERSATIONS);
  }

  async getByParticipant(userId: string) {
    return this.getAll([
      where('participantIds', 'array-contains', userId),
      orderBy('lastMessageAt', 'desc'),
    ]);
  }
}

export const conversationRepository = new ConversationRepository();
