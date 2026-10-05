import { COLLECTIONS, NotificationDocument } from '@spartan-g/shared-types';
import { Unsubscribe, where } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

/**
 * Normalise a notification timestamp to milliseconds.
 *
 * Some legacy writers (e.g. AppointmentService.createNotification uses a raw
 * setDoc) stamp `created_at`, while BaseRepository.create stamps `createdAt`.
 * Until those documents are migrated, every read/sort path tolerates BOTH.
 */
type NotificationTimestamp =
  | { toMillis?: () => number; toDate?: () => Date }
  | string
  | number
  | Date
  | null
  | undefined;

export function notificationTimeToMillis(value: NotificationTimestamp): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().getTime();
  }
  const ms = new Date(value as string | number).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** Sort newest-first using whichever timestamp key the document actually has. */
export function sortNotificationsNewestFirst<
  T extends NotificationDocument & { id: string },
>(notifications: T[]): T[] {
  return [...notifications].sort((a, b) => {
    const aMs = Math.max(
      notificationTimeToMillis(a.createdAt),
      notificationTimeToMillis((a as unknown as { created_at?: NotificationTimestamp }).created_at),
    );
    const bMs = Math.max(
      notificationTimeToMillis(b.createdAt),
      notificationTimeToMillis((b as unknown as { created_at?: NotificationTimestamp }).created_at),
    );
    return bMs - aMs;
  });
}

class NotificationRepository extends BaseRepository<NotificationDocument> {
  constructor() {
    super(COLLECTIONS.NOTIFICATIONS);
  }

  /**
   * Create an in-app notification for a user. Generates the document id
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
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const id = `notif_${input.userId}_${ts}_${rand}`;
    await this.create(id, {
      userId: input.userId,
      title: input.title,
      body: input.body,
      type: input.type,
      relatedId: input.relatedId ?? null,
      data: input.data ?? {},
      isRead: false,
    } as unknown as NotificationDocument & { id: string });
    return id;
  }

  async getByUserId(userId: string) {
    const notifications = await this.getAll([where('userId', '==', userId)]);
    return sortNotificationsNewestFirst(notifications);
  }

  async getUnreadByUserId(userId: string) {
    const notifications = await this.getAll([
      where('userId', '==', userId),
      where('isRead', '==', false),
    ]);
    return sortNotificationsNewestFirst(notifications);
  }

  /** Most recent N notifications for a user (default 20) — used by the web bell. */
  async getRecentByUserId(userId: string, limitCount = 20) {
    const notifications = await this.getAll([where('userId', '==', userId)]);
    return sortNotificationsNewestFirst(notifications).slice(0, limitCount);
  }

  async markAsRead(notificationId: string) {
    return this.update(notificationId, { isRead: true } as Partial<NotificationDocument>);
  }

  async markAllAsRead(userId: string) {
    const unread = await this.getUnreadByUserId(userId);
    await Promise.all(unread.map((n) => this.markAsRead(n.id)));
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
  ): Unsubscribe {
    return this.subscribeQuery([where('userId', '==', userId)], (documents) => {
      callback(sortNotificationsNewestFirst(documents));
    }, onError);
  }
}

export const notificationRepository = new NotificationRepository();