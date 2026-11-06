/** Native clients never send remote pushes. Stage 1 has no approved trusted transport. */
class NativePushNotificationService {
  async sendPushToRecipient(_recipientId: string, _title: string, _body: string, _data: Record<string, string>): Promise<void> {
    // Preserve callers' saved-message/appointment behavior without reading tokens or sending private previews.
  }
}
export const pushNotificationService = new NativePushNotificationService();
