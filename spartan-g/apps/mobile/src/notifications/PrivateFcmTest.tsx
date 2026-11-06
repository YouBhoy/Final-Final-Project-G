import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, NativeModules, Platform, Pressable, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import * as ScreenCapture from 'expo-screen-capture';
import { useAuthStore } from '@spartan-g/shared-services';
import { appLock, useAppLock } from '../security/app-lock';
import { ProfileToggle, profileStyles as styles } from '../screens/profile/ProfileDesign';
import { notificationContext } from './runtime';
import { preparePhonePermission } from './native-preparation';
import { createPrivateFcmTest } from './private-fcm-test-core';

type Clipboard = { copyToken(value: string): Promise<void>; clearToken(): void };
export function PrivateFcmTest() {
  // Snapshot reads alone do not refresh this view after unlock/busy/lifecycle changes.
  useAppLock();
  const focused = useIsFocused(), focusedRef = useRef(focused); focusedRef.current = focused;
  const clipboard = NativeModules.SpartanPrivateClipboard as Clipboard | undefined;
  const controller = useRef<ReturnType<typeof createPrivateFcmTest> | null>(null);
  if (!controller.current) controller.current = createPrivateFcmTest({
    context: () => { const c = notificationContext(); return { ...c, ready: c.ready && focusedRef.current && Platform.OS === 'android' && AppState.currentState === 'active' }; },
    permission: preparePhonePermission,
    token: async () => {
      // Old APKs may have opted into Expo relay auto-registration. This manual
      // native-token request must not upload a rotated token to that relay.
      await Notifications.setAutoServerRegistrationEnabledAsync(false);
      if (!notificationContext().ready || !focusedRef.current || AppState.currentState !== 'active') throw Error('Test no longer unlocked');
      // Protect the token's recent-app preview even when optional App Lock is OFF.
      // A separate tag cannot release the existing biometric boundary's protection.
      try { await ScreenCapture.preventScreenCaptureAsync('private-fcm-test'); }
      catch { await ScreenCapture.allowScreenCaptureAsync('private-fcm-test').catch(() => {}); throw Error('Private display unavailable'); }
      if (!notificationContext().ready || !focusedRef.current || AppState.currentState !== 'active') throw Error('Test no longer unlocked');
      return Notifications.getDevicePushTokenAsync();
    },
    copy: async value => { if (!clipboard) throw Error('Clipboard unavailable'); await clipboard.copyToken(value); },
    clearCopy: () => { clipboard?.clearToken(); },
  });
  const test = controller.current;
  const state = useSyncExternalStore(test.subscribe, test.getSnapshot, test.getSnapshot);
  useEffect(() => {
    test.start();
    const auth = useAuthStore.subscribe(test.synchronize), lock = appLock.subscribe(test.synchronize);
    const lifecycle = AppState.addEventListener('change', test.synchronize);
    return () => { auth(); lock(); lifecycle.remove(); test.stop(); void ScreenCapture.allowScreenCaptureAsync('private-fcm-test').catch(() => {}); };
  }, [test]);
  useEffect(() => { test.synchronize(); }, [focused, test]);
  const current = notificationContext();
  const ready = focused && Platform.OS === 'android' && current.ready && AppState.currentState === 'active'
    && current.owner === state.owner && current.session === state.session;
  return <>
    <Text accessibilityRole="header" style={styles.section}>PRIVATE ANDROID PUSH TEST</Text>
    <View style={styles.notice}><Text style={styles.noticeText}>Temporary owner-operated test only. OFF each time this screen closes, backgrounds or locks. Spartan-G keeps the displayed token in memory only; Android/FCM manages its own registration cache. Nothing is sent to Firestore. Send only: Spartan-G / Private notification test.</Text></View>
    <ProfileToggle testID="private-fcm-enable" title="Enable private FCM test" subtitle="This does not activate automatic alerts or change your notification preferences." icon="smartphone" value={ready && state.enabled} disabled={!ready} onChange={test.enable} />
    {ready && state.enabled && <View style={styles.notice}>
      <Pressable testID="private-fcm-get-token" accessibilityRole="button" disabled={state.busy} style={styles.action} onPress={() => void test.obtain()}><Text style={styles.actionText}>{state.busy ? 'Checking Android notification registration...' : 'Get Native FCM Token'}</Text></Pressable>
      {state.token && <><Text testID="private-fcm-token" accessible={false} importantForAccessibility="no" style={[styles.neutral, { fontFamily: 'monospace', fontSize: 12 }]}>{state.token}</Text>
        <Pressable testID="private-fcm-copy" accessibilityRole="button" style={styles.action} onPress={() => void test.copy()}><Text style={styles.actionText}>Copy Token</Text></Pressable></>}
      {!!state.message && <Text accessibilityLiveRegion="polite" style={styles.neutral}>{state.message}</Text>}
      <Text style={styles.neutral}>Use Firebase Console → Messaging → Send test message for this phone only. Do not publish a campaign. With the app in the background, Android can display this generic test independently of local foreground preferences. Test taps open the normal app through Firebase Auth and App Lock; they never open a private record.</Text>
    </View>}
  </>;
}
