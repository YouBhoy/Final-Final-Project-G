import { Platform } from 'react-native';
import { registerForPushNotifications } from '@/firebase/messaging';
import { deviceTokenRepository } from '@/repositories/device-token.repository';
import { DeviceTokenDocument } from '@/types/user.types';

class NotificationService {
  async registerDevice(uid: string): Promise<string | null> {
    const token = await registerForPushNotifications();
    if (!token) return null;

    const platform = Platform.OS as DeviceTokenDocument['platform'];
    const docId = `${uid}_${platform}`;

    await deviceTokenRepository.create(docId, {
      uid,
      token,
      platform,
    } as DeviceTokenDocument);

    return token;
  }

  async getUserTokens(uid: string) {
    return deviceTokenRepository.getByUserId(uid);
  }
}

export const notificationService = new NotificationService();
