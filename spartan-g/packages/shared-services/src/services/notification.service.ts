import { DeploymentTarget, DeviceTokenDocument, NotificationDocument, COLLECTIONS } from '@spartan-g/shared-types';
import { deviceTokenRepository } from '../repositories/device-token.repository';
import { getMessagingAdapter } from '../firebase/messaging-adapter';
import { collection, doc, getFirestoreDb, serverTimestamp, setDoc } from '../firebase/firestore';

/** Payload for creating an in-app notification document. */
export interface InAppNotificationPayload {
  userId: string;
  title: string;
  body: string;
  type: NotificationDocument['type'];
  /** ID of the related entity (e.g. appointmentId or conversationId) used for deep-linking. */
  relatedId?: string;
}

class NotificationService {
  async registerDevice(uid: string, deploymentTarget: DeploymentTarget): Promise<string | null> {
    const adapter = getMessagingAdapter();
    const result = await adapter.registerForPushNotifications(deploymentTarget);
    if (!result) return null;

    const docId = `${uid}_${deploymentTarget}`;
    await deviceTokenRepository.create(docId, {
      uid,
      token: result.token,
      platform: result.platform,
      deploymentTarget,
    } as DeviceTokenDocument);

    return result.token;
  }

  async getUserTokens(uid: string) {
    return deviceTokenRepository.getByUserId(uid);
  }

  /**
   * Create an in-app notification document in the `notifications` collection.
   * Writes both `created_at`/`updated_at` (legacy snake_case read by the web UI)
   * and `createdAt`/`updatedAt` (used by repository sorting).
   */
  async createInAppNotification(payload: InAppNotificationPayload): Promise<string> {
    const id = `notif_${payload.userId}_${Date.now()}`;
    await setDoc(doc(getFirestoreDb(), COLLECTIONS.NOTIFICATIONS, id), {
      userId: payload.userId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      isRead: false,
      data: payload.relatedId ? { relatedId: payload.relatedId } : {},
      relatedId: payload.relatedId ?? null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  }
}

export const notificationService = new NotificationService();
