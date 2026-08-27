import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DeploymentTarget } from '@spartan-g/shared-types';
import {
  MessagingAdapter,
  PushRegistrationResult,
} from '@spartan-g/shared-services';
import { env } from '@spartan-g/shared-services/src/config/env';
import { getOpenConversationId } from '../navigation/navigationRef';

/**
 * The high-importance Android notification channel used for every push this
 * app displays. Must match push-notification.service.ts, which tags outgoing
 * Expo pushes with `channelId: DEFAULT_CHANNEL_ID` so that BOTH delivery
 * paths target it:
 *  - Background/backgrounded → FCM renders directly against this channel.
 *  - App open (foreground)   → expo-notifications re-posts locally to the
 *    notification's channelId; without one it falls back to a generic channel
 *    that may not be importance-HIGH, which silently swallowed banners.
 */
const DEFAULT_CHANNEL_ID = 'default';

/**
 * Foreground banner behavior returned by the handler. expo-notifications 0.29
 * (SDK 52) only declares the three legacy fields on NotificationBehavior;
 * newer SDKs replace `shouldShowAlert`'s role on Android with the explicit
 * shouldShowBanner/shouldShowList pair. We include both so upgrading the SDK
 * later requires no logic change here — the current version ignores them.
 */
type ForegroundBehavior = Notifications.NotificationBehavior & {
  shouldShowBanner?: boolean;
  shouldShowList?: boolean;
};

// Create the channel at module load (not only during registration) so it
// exists before the very first incoming push, even if no user ever signs in
// on this device. Idempotent — safe to also call inside registration.
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'General',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  }).catch(() => {
    /* Channel creation failures fall back to OS defaults */
  });
}

Notifications.setNotificationHandler({
  handleNotification: async (notification): Promise<ForegroundBehavior> => {
    // Same payload object the background path receives — title/body/data.url
    // are untouched by presentation decisions.
    const data = notification.request.content.data;
    const url = typeof data?.url === 'string' ? data.url : '';

    // Message pushes are the only ones deep-linking into a conversation:
    // `spartan-g://{student|facilitator}/conversation/{conversationId}`.
    // Appointment bookings link to tabs/screens, never conversations, so they
    // always show a banner even while their screen is already open.
    if (url) {
      const conversationMatch = url.match(
        /^spartan-g:\/\/(?:student|facilitator)\/conversation\/(.+)$/,
      );

      // Already viewing that exact conversation on screen? The message is
      // visible in real time via the screen's Firestore subscription — popups
      // would be noise. Badge still updates so unread state stays correct.
      if (
        conversationMatch &&
        conversationMatch[1] === getOpenConversationId()
      ) {
        return {
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: true,
          shouldShowBanner: false,
          shouldShowList: true,
        };
      }
    }

    // Everything else — messages in other threads, appointment bookings,
    // facilitator accept/cancel updates — surfaces an OS banner while the
    // app is open, mirroring Facebook-style in-app notification overlays.
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
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
      await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
        name: 'General',
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
    // Return a plain unsubscribe function as the MessagingAdapter contract
    // expects; EventSubscription also supports notifications dismiss helpers.
    const subscription = Notifications.addNotificationReceivedListener(callback);
    return () => subscription.remove();
  },
};
