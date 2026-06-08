import { DeploymentTarget } from '@spartan-g/shared-types';

/**
 * Platform-specific push notification adapter.
 * Mobile: Expo Notifications → FCM
 * Web: Firebase Messaging Web SDK
 */
export interface PushRegistrationResult {
  token: string;
  platform: 'ios' | 'android' | 'web';
}

export interface MessagingAdapter {
  registerForPushNotifications(
    deploymentTarget: DeploymentTarget,
  ): Promise<PushRegistrationResult | null>;
  onMessageReceived?(callback: (payload: unknown) => void): () => void;
}

let messagingAdapter: MessagingAdapter | null = null;

export function setMessagingAdapter(adapter: MessagingAdapter): void {
  messagingAdapter = adapter;
}

export function getMessagingAdapter(): MessagingAdapter {
  if (!messagingAdapter) {
    throw new Error('MessagingAdapter not initialized. Call setMessagingAdapter() at app startup.');
  }
  return messagingAdapter;
}
