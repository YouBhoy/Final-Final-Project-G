import { deviceTokenRepository } from '../repositories/device-token.repository';

const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, string>;
  priority: 'high';
  /**
   * Android notification channel the message is delivered through. The app
   * registers a MAX-importance `default` channel in expo-messaging.adapter;
   * tagging pushes with it is what makes FOREGROUND (app-open) delivery post
   * a heads-up banner instead of falling back to a lower-importance channel.
   * iOS ignores channelId.
   */
  channelId?: string;
}

class PushNotificationService {
  /**
   * Send a push notification to a single Expo push token.
   * Non-blocking — errors are logged but never thrown to the caller.
   */
  private async sendToToken(message: ExpoPushMessage): Promise<void> {
    try {
      const response = await fetch(EXPO_PUSH_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[PushNotification] Expo API error:', response.status, text);
      }
    } catch (err) {
      console.error('[PushNotification] Failed to send push:', err);
    }
  }

  /**
   * Look up a recipient's device tokens and send a push to all of them.
   * Non-blocking — the caller's primary action always succeeds regardless.
   */
  async sendPushToRecipient(
    recipientId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void> {
    try {
      const tokens = await deviceTokenRepository.getByUserId(recipientId);

      if (!tokens || tokens.length === 0) {
        return; // No registered device — silently skip
      }

      await Promise.all(
        tokens.map((t) =>
          this.sendToToken({
            to: t.token,
            sound: 'default',
            title,
            body,
            data,
            priority: 'high',
            channelId: 'default',
          }),
        ),
      );
    } catch (err) {
      console.error('[PushNotification] Failed to deliver push to recipient:', err);
    }
  }
}

export const pushNotificationService = new PushNotificationService();