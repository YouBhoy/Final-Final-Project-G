import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
/** Explicit ports only. No calls at import and no production client is installed. */
export const nativeFcm = {
  async token() {
    if (Platform.OS !== 'android' || AppState.currentState !== 'active') throw Error('Foreground Android required');
    if (!(await Notifications.getPermissionsAsync()).granted) throw Error('Notification permission required');
    await Notifications.setAutoServerRegistrationEnabledAsync(false);
    return Notifications.getDevicePushTokenAsync();
  },
  tokenListener: Notifications.addPushTokenListener,
  proofListener(observe: (data: unknown) => void) { return Notifications.addNotificationReceivedListener(n => observe(n.request.content.data)); },
};
