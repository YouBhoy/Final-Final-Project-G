import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { profileColors as colors } from '../screens/profile/ProfileDesign';
import { openNotificationSettings, preparePhonePermission, readPhoneChannels } from './native-preparation';
import { createPermissionSettings, permissionSettingsCopy } from './permission-settings';

export function PhoneNotificationPermission() {
  const [showChannels, setShowChannels] = useState(false), [showVisibility, setShowVisibility] = useState(false);
  const focused = useIsFocused(), focusedRef = useRef(focused); focusedRef.current = focused;
  const controllerRef = useRef<ReturnType<typeof createPermissionSettings> | null>(null);
  if (!controllerRef.current) controllerRef.current = createPermissionSettings({
    android: Platform.OS === 'android', sdk: Number(Platform.Version),
    active: () => focusedRef.current && AppState.currentState === 'active',
    read: Notifications.getPermissionsAsync, prepare: preparePhonePermission, open: openNotificationSettings, channels: readPhoneChannels,
  });
  const controller = controllerRef.current;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const copy = permissionSettingsCopy(state);
  useEffect(() => {
    controller.start();
    const subscription = AppState.addEventListener('change', value => {
      if (value === 'active') void controller.refresh(); else controller.suspend();
    });
    return () => { subscription.remove(); controller.stop(); };
  }, [controller]);
  useEffect(() => { if (focused) void controller.refresh(); else controller.suspend(); }, [controller, focused]);
  const disabled = state.busy || state.phase === 'checking' || state.phase === 'unsupported' || !focused || AppState.currentState !== 'active';
  const label = state.busy ? state.activity === 'request' ? state.phase === 'allowed' ? 'Setting up channels...' : 'Waiting for your choice...' : state.activity === 'settings' ? 'Opening settings...' : 'Checking permission...' : copy.action;
  return <View testID="phone-permission-card" style={styles.card}>
    <View style={styles.heading}><View style={styles.icon} accessible={false} importantForAccessibility="no-hide-descendants"><Feather name="bell" size={23} color={colors.crimson} /></View>
      <View style={styles.copy}><Text accessibilityRole="header" style={styles.title}>Set Up Phone Notifications</Text>
        <Text testID="phone-permission-status" accessibilityLiveRegion="polite" style={styles.status}>{copy.status}</Text></View></View>
    <Text style={styles.description}>{state.phase === 'blocked'
      ? 'Notifications are blocked in Android. Open Spartan-G notification settings to allow them. Your preferences stay saved.'
      : state.phase === 'unsupported' ? 'This control is available in the Spartan-G Android app.'
      : state.channelBlocked ? 'A notification channel is blocked. Review its settings in Android; app-level permission and individual channels are separate.'
      : 'Choose whether Android may show Spartan-G notifications. Sound, channels and lock-screen privacy remain under your control.'}</Text>
    <Pressable testID="phone-permission-action" accessibilityRole="button" accessibilityLabel={copy.action}
      accessibilityHint={state.phase === 'not-requested' && !state.channelBlocked ? 'Checks permission and asks Android for your decision.' : 'Checks permission or opens the system settings for this app.'}
      accessibilityState={{ disabled, busy: state.busy || state.phase === 'checking' }} disabled={disabled}
      onPress={() => void controller.act()} style={({ pressed }) => [styles.button, (disabled || pressed) && styles.muted]}>
      {(state.busy || state.phase === 'checking') && <ActivityIndicator color="#FFFFFF" />}
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
    {state.phase === 'unavailable' && <Pressable testID="phone-permission-settings" accessibilityRole="button"
      accessibilityLabel="Open Android Notification Settings" accessibilityHint="Opens Spartan-G notification settings without changing permissions."
      accessibilityState={{ disabled: state.busy }} disabled={state.busy} onPress={() => void controller.act(true)} style={styles.secondary}>
      <Text style={styles.secondaryText}>Open Android Notification Settings</Text></Pressable>}
    {!!state.error && <Text testID="phone-permission-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text>}
    <Text accessibilityRole="header" style={styles.subheading}>Notification channels</Text>
    <Text testID="phone-channel-status" accessibilityLiveRegion="polite" style={styles.description}>{state.channels.status === 'not-required'
      ? 'This Android version uses app-wide notification settings; individual channels are not required.'
      : state.channels.status === 'unavailable' ? 'Channel status could not be verified. Review Android Notification Settings; permission alone is not a channel check.'
      : state.channelBlocked ? 'One or more channels are blocked in Android.'
      : state.channels.channels.some(c => c.state === 'missing') ? 'Some channels are not created yet. Set up channels using the button above; no token is registered.'
      : state.channels.channels.some(c => c.state === 'unknown') ? 'Some channel settings could not be verified.' : 'Known channels are enabled. Delivery still depends on Android and the sender.'}</Text>
    {state.channels.status === 'ready' && <Pressable testID="phone-channel-details" accessibilityRole="button" accessibilityLabel="Channel Status and Sound Details" accessibilityState={{ expanded: showChannels }} style={styles.secondary} onPress={() => setShowChannels(v => !v)}>
      <Text style={styles.secondaryText}>{showChannels ? 'Hide Channel Details' : 'Channel Status & Sound Details'}</Text></Pressable>}
    {showChannels && state.channels.channels.map(channel => <Pressable key={channel.id} testID={'phone-channel-' + channel.id}
      accessibilityRole="button" accessibilityLabel={'Manage Notification Channels: ' + channel.name}
      accessibilityHint="Opens this channel in Android Settings. Existing choices are not reset."
      accessibilityState={{ disabled }} disabled={disabled} style={styles.channel}
      onPress={() => void controller.act(channel.state === 'missing' ? { kind: 'app' } : { kind: 'channel', channelId: channel.id })}>
      <Text style={styles.secondaryText}>{channel.name}</Text><Text style={styles.description}>{channel.state === 'blocked' ? 'Blocked' : channel.state === 'missing' ? 'Not created' : channel.state === 'enabled' ? 'Enabled' : 'Unknown'} · Importance: {channel.importance}</Text>
      <Text style={styles.note}>{channel.sound} · {channel.visibility}</Text>
    </Pressable>)}
    <Pressable testID="phone-manage-channels" accessibilityRole="button" accessibilityLabel="Manage Notification Channels"
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => void controller.act({ kind: 'app' })} style={styles.secondary}>
      <Text style={styles.secondaryText}>Manage Notification Channels</Text></Pressable>
    <Text style={styles.note}>Existing channels keep your Android choices. Minimum or Low importance may be quiet; open the relevant channel to choose its sound and alert behavior. This app does not raise existing channel importance.</Text>
    <Pressable testID="phone-visibility-help" accessibilityRole="button" accessibilityLabel="Lock-Screen and Status-Bar Help" accessibilityState={{ expanded: showVisibility }} style={styles.secondary} onPress={() => setShowVisibility(v => !v)}>
      <Text style={styles.secondaryText}>Lock-Screen & Status-Bar Help</Text></Pressable>
    {showVisibility && <><Text accessibilityRole="header" style={styles.subheading}>Lock screen & status bar</Text>
    <Text style={styles.description}>Lock-screen and status-bar visibility cannot be verified or enabled here. In Spartan-G notification settings, review lock-screen display while keeping sensitive content hidden.</Text>
    <Pressable testID="phone-lockscreen-settings" accessibilityRole="button" accessibilityLabel="Review Lock-Screen Notifications"
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => void controller.act({ kind: 'app' })} style={styles.secondary}>
      <Text style={styles.secondaryText}>Review Lock-Screen Notifications</Text></Pressable>
    <Text style={styles.note}>On supported Honor versions: Settings → Notifications → More notification settings → Show notification icons in the status bar. Names vary by firmware; search Settings for notification icons. No exact public Honor shortcut is assumed.</Text>
    <Pressable testID="phone-statusbar-settings" accessibilityRole="button" accessibilityLabel="Status-Bar Icons: Open Android Settings"
      accessibilityHint="Opens general Android Settings. Search for notification icons; there is no verified direct shortcut."
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => void controller.act({ kind: 'system' })} style={styles.secondary}>
      <Text style={styles.secondaryText}>Status-Bar Icons: Android Settings</Text></Pressable></>}
    <Text style={styles.note}>Permission alone does not register this device or enable server delivery. The private FCM test below remains separate.</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderColor: '#F5D6DE', borderWidth: 1, borderRadius: 20, padding: 17, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 }, icon: { width: 45, height: 45, borderRadius: 14, backgroundColor: '#FFF0F3', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 }, title: { color: colors.ink, fontSize: 17, lineHeight: 24, fontWeight: '700' }, status: { color: colors.crimson, fontSize: 14, lineHeight: 21, fontWeight: '600', marginTop: 2 },
  description: { color: colors.slate, fontSize: 13, lineHeight: 20 }, button: { minHeight: 52, paddingHorizontal: 15, paddingVertical: 13, borderRadius: 15, backgroundColor: colors.crimson, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  muted: { opacity: 0.6 }, buttonText: { flexShrink: 1, textAlign: 'center', color: '#FFFFFF', fontSize: 14, lineHeight: 21, fontWeight: '700' },
  secondary: { minHeight: 48, padding: 10, alignItems: 'center', justifyContent: 'center' }, secondaryText: { textAlign: 'center', color: colors.crimson, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  note: { color: colors.slate, fontSize: 12, lineHeight: 18 }, error: { color: '#B91C1C', fontSize: 13, lineHeight: 20 },
  subheading: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '700', marginTop: 3 },
  channel: { minHeight: 64, padding: 12, gap: 3, borderRadius: 13, backgroundColor: '#FFF9FA' },
});
