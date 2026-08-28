import { COLLECTIONS, NotificationDocument } from '@spartan-g/shared-types';
import { Unsubscribe, where } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

/**
 * TECH DEBT: some legacy writers (e.g. AppointmentService.createNotification uses a
 * raw `setDoc`) stamp `created_at`, while BaseRepository.create stamps `createdAt`.
 * Until those documents are migrated, every notification read/sort path below
 * tolerates BOTH timestamp keys.
 */
type NotificationTimestamp = { toMillis?: () => number } | string | number | Date | null | undefined;

function notificationTimeToMillis(value: NotificationTimestamp): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis();
  }
  const ms = new Date(value as any).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function sortNotificationsNewestFirst<
  T extends NotificationDocument & { id: string },
>(notifications: T[]): T[] {
  return [...notifications].sort((a, b) => {
    const aMs = Math.max(
      notificationTimeToMillis(a.createdAt),
      notificationTimeToMillis((a as any).created_at),
    );
    const bMs = Math.max(
      notificationTimeToMillis(b.createdAt),
      notificationTimeToMillis((b as any).created_at),
    );
    return bMs - aMs;
  });
}

class NotificationRepository extends BaseRepository<NotificationDocument> {
  constructor() {
    super(COLLECTIONS.NOTIFICATIONS);
  }

  /**
   * Create an in-app notification for a user. Generates the document ID
   * (notif_{userId}_{ts}_{rand}) and stamps timestamps via BaseRepository.create.
   */
  async createForUser(input: {
    userId: string;
    title: string;
    body: string;
    type: NotificationDocument['type'];
    relatedId?: string;
    data?: Record<string, unknown>;
  }): Promise<string> {
    const id = `notif_${input.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
      isRead: false,
      ...(input.relatedId ? { relatedId: input.relatedId } : {}),
      ...(input.data ? { data: input.data } : {}),
    };
    await this.create(id, payload as unknown as NotificationDocument);
    return id;
  }

  async getByUserId(userId: string) {
    const notifications = await this.getAll([
      where('userId', '==', userId),
    ]);
    return sortNotificationsNewestFirst(notifications);
  }

  async getUnreadByUserId(userId: string) {
    const notifications = await this.getAll([
      where('userId', '==', userId),
      where('isRead', '==', false),
    ]);
    return sortNotificationsNewestFirst(notifications);
  }

  /**
   * Live listener over a user's notifications (real-time badge + list support).
   * Emits newest-first on every change. Requires no composite index — the only
   * equality filter is on `userId`, which is covered by the built-in index.
   */
  subscribeByUserId(
    userId: string,
    callback: (notifications: (NotificationDocument & { id: string })[]) => void,
  ): Unsubscribe {
    return this.subscribeQuery([where('userId', '==', userId)], (docs) => {
      callback(sortNotificationsNewestFirst(docs));
    });
  }
}

export const notificationRepository = new NotificationRepository();