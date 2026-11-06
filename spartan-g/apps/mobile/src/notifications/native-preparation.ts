import { Alert, AppState, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { createPermissionPreparation } from './permission-core';
import { ensureNotificationChannels, NOTIFICATION_CHANNELS } from './channel-core';
import { inspectPhoneChannels } from './channel-status';
import { launchDeviceSettings, type DeviceSettingsTarget } from './settings-links';

export const preparePhonePermission = createPermissionPreparation({
  android: Platform.OS === 'android',
  sdk: Number(Platform.Version),
  active: () => AppState.currentState === 'active',
  explain: () => new Promise(resolve => Alert.alert('Phone notifications',
    'Spartan-G can alert you to authorized messages, appointment changes and assessment updates. Previews contain no counseling or screening details. You can decline or change each category in Android Settings. Server delivery is currently inactive.',
    [{ text: 'Not now', style: 'cancel', onPress: () => resolve(false) }, { text: 'Continue', onPress: () => resolve(true) }],
    { cancelable: true, onDismiss: () => resolve(false) })),
  permission: () => Notifications.getPermissionsAsync(),
  request: () => Notifications.requestPermissionsAsync(),
  async legacyChannelBlocked() { const old = await Notifications.getNotificationChannelAsync('default'); return old?.importance === Notifications.AndroidImportance.NONE; },
  async channels() {
    await ensureNotificationChannels({ sdk: Number(Platform.Version), get: Notifications.getNotificationChannelAsync,
      importance: { none: Notifications.AndroidImportance.NONE, normal: Notifications.AndroidImportance.DEFAULT },
      async create(channel, settings) { await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name, description: channel.description, importance: settings.importance,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        sound: settings.sound, enableVibrate: settings.enableVibrate, bypassDnd: false,
      }); },
    });
  },
});

export function readPhoneChannels() {
  return inspectPhoneChannels({ sdk: Number(Platform.Version), read: Notifications.getNotificationChannelsAsync,
    importance: Notifications.AndroidImportance, visibility: Notifications.AndroidNotificationVisibility });
}

export function openNotificationSettings(mayContinue: () => boolean = () => true, target: DeviceSettingsTarget = { kind: 'app' }) {
  return launchDeviceSettings({ android: Platform.OS === 'android', sdk: Number(Platform.Version),
    packageId: Constants.expoConfig?.android?.package, channelIds: target.kind === 'channel' ? [...NOTIFICATION_CHANNELS.map(c => c.id), 'default', 'fcm_fallback_notification_channel'] : [],
    active: () => AppState.currentState === 'active', send: Linking.sendIntent, appDetails: Linking.openSettings }, target, mayContinue);
}
