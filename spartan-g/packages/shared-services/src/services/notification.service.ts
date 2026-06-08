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
}

export const notificationService = new NotificationService();
