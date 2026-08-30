import { DeploymentTarget, DeviceTokenDocument } from '@spartan-g/shared-types';
import { deviceTokenRepository } from '../repositories/device-token.repository';
import { getMessagingAdapter } from '../firebase/messaging-adapter';

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
   * Remove this user's device-token documents (called on sign-out) so the
   * physical device stops receiving pushes for an account that is no longer
   * logged in. Best-effort — never blocks or fails the sign-out flow.
   */
  async unregisterDevice(uid: string): Promise<void> {
    // Deterministic doc IDs (`${uid}_${target}`) work even under strict rules
    // where LIST queries on device_tokens can be rejected entirely — deleting
    // a non-existent document is a no-op.
    const MOBILE_TARGETS: DeploymentTarget[] = ['student_mobile', 'facilitator_mobile'];
    await Promise.all(
      MOBILE_TARGETS.map((t) =>
        deviceTokenRepository.delete(`${uid}_${t}`).catch(() => {}),
      ),
    );

    // Best-effort sweep of any other token docs registered for this uid.
    try {
      const tokens = await deviceTokenRepository.getByUserId(uid);
      await deviceTokenRepository.deleteAll(tokens);
    } catch {
      /* Rules may deny list queries here — targeted deletes above already ran */
    }
  }
}

export const notificationService = new NotificationService();
