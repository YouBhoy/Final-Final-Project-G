import { COLLECTIONS, NotificationDocument } from '@spartan-g/shared-types';
import { where } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class NotificationRepository extends BaseRepository<NotificationDocument> {
  constructor() {
    super(COLLECTIONS.NOTIFICATIONS);
  }

  async getByUserId(userId: string) {
    const notifications = await this.getAll([
      where('userId', '==', userId),
    ]);

    return notifications.sort((a, b) => {
      const aTime = a.created_at?.toMillis?.() ?? (a.created_at ? new Date(a.created_at as any).getTime() : 0);
      const bTime = b.created_at?.toMillis?.() ?? (b.created_at ? new Date(b.created_at as any).getTime() : 0);
      return bTime - aTime;
    });
  }

  async getUnreadByUserId(userId: string) {
    const notifications = await this.getAll([
      where('userId', '==', userId),
      where('isRead', '==', false),
    ]);

    return notifications.sort((a, b) => {
      const aTime = a.created_at?.toMillis?.() ?? (a.created_at ? new Date(a.created_at as any).getTime() : 0);
      const bTime = b.created_at?.toMillis?.() ?? (b.created_at ? new Date(b.created_at as any).getTime() : 0);
      return bTime - aTime;
    });
  }
}

export const notificationRepository = new NotificationRepository();