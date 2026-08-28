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
      const aTime = a.createdAt?.toMillis?.() ?? (a.createdAt ? new Date(a.createdAt as any).getTime() : 0);
      const bTime = b.createdAt?.toMillis?.() ?? (b.createdAt ? new Date(b.createdAt as any).getTime() : 0);
      return bTime - aTime;
    });
  }

  async getUnreadByUserId(userId: string) {
    const notifications = await this.getAll([
      where('userId', '==', userId),
      where('isRead', '==', false),
    ]);

    return notifications.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? (a.createdAt ? new Date(a.createdAt as any).getTime() : 0);
      const bTime = b.createdAt?.toMillis?.() ?? (b.createdAt ? new Date(b.createdAt as any).getTime() : 0);
      return bTime - aTime;
    });
  }

  /**
   * Real-time subscription to a user's notifications (newest first).
   * Used by the web notification bell so in-app notifications (messages,
   * assessments, appointments) appear instantly.
   */
  subscribeByUserId(
    userId: string,
    callback: (notifications: (NotificationDocument & { id: string })[]) => void,
    onError?: (error: Error) => void,
  ) {
    return this.subscribeQuery([where('userId', '==', userId)], (documents) => {
      const sorted = documents.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? (a.createdAt ? new Date(a.createdAt as any).getTime() : 0);
        const bTime = b.createdAt?.toMillis?.() ?? (b.createdAt ? new Date(b.createdAt as any).getTime() : 0);
        return bTime - aTime;
      });
      callback(sorted);
    }, onError);
  }
}

export const notificationRepository = new NotificationRepository();