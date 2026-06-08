import { getToken, onMessage, Messaging } from 'firebase/messaging';
import { DeploymentTarget } from '@spartan-g/shared-types';
import {
  MessagingAdapter,
  PushRegistrationResult,
  getFirebaseApp,
} from '@spartan-g/shared-services';

let messagingInstance: Messaging | null = null;

async function getMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  if (!messagingInstance) {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) return null;
    messagingInstance = getMessaging(getFirebaseApp());
  }
  return messagingInstance;
}

export const webMessagingAdapter: MessagingAdapter = {
  async registerForPushNotifications(
    _deploymentTarget: DeploymentTarget,
  ): Promise<PushRegistrationResult | null> {
    const messaging = await getMessaging();
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
    if (!vapidKey) return null;

    const token = await getToken(messaging, { vapidKey });
    return { token, platform: 'web' };
  },

  onMessageReceived(callback) {
    getMessaging().then((messaging) => {
      if (!messaging) return;
      return onMessage(messaging, callback);
    });
    return () => {};
  },
};
