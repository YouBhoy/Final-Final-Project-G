import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DeploymentTarget } from '@spartan-g/shared-types';
import {
  MessagingAdapter,
  PushRegistrationResult,
} from '@spartan-g/shared-services';
import { env } from '@spartan-g/shared-services/src/config/env';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const expoMessagingAdapter: MessagingAdapter = {
  async registerForPushNotifications(
    _deploymentTarget: DeploymentTarget,
  ): Promise<PushRegistrationResult | null> {
    if (!Device.isDevice) return null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const projectId = env.eas.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    return {
      token: tokenData.data,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    };
  },

  onMessageReceived(callback) {
    return Notifications.addNotificationReceivedListener(callback);
  },
};
