import * as Notifications from 'expo-notifications';
import type { MessagingAdapter } from '@spartan-g/shared-services';
import { profilePreferences, currentPreferenceOwner } from '../profile/preferences';
import { phonePreferences, currentPhoneOwner } from '../notifications/phone-preferences';
import { foregroundPresentation } from '../notifications/foreground';
import { notificationContext } from '../notifications/runtime';

// No channel creation, permission prompt, Expo token request or Firestore write at import/login.
// Permission/channel preparation is explicitly requested from the unlocked Profile screen.
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const local = profilePreferences.getSnapshot(), owner = currentPreferenceOwner();
    const phone = phonePreferences.getSnapshot();
    const ready = !!owner && local.owner === owner && local.status === 'ready';
    return foregroundPresentation(notification.request.content, notificationContext(),
      phone.owner === currentPhoneOwner() && phone.status === 'ready' ? phone.values : null,
      { messages: ready && local.values.messageBanners, appointments: ready && local.values.appointmentBanners, sound: ready && local.values.foregroundSound },
      Date.now());
  },
});

export const expoMessagingAdapter: MessagingAdapter = {
  managesRegistration: true,
  // Production binding/transport is intentionally absent in Stage 1.
  // Pure injected token rotation/revocation logic lives in notifications/token-registration.ts.
  async registerForPushNotifications() { return null; },
  onMessageReceived(callback) {
    const subscription = Notifications.addNotificationReceivedListener(callback);
    return () => subscription.remove();
  },
};
