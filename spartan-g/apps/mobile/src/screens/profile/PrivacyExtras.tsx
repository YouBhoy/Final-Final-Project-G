import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState, Text, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuthStore } from '@spartan-g/shared-services';
import { createDeviceSettingsAction } from '../../profile/device-settings-action';
import { openNotificationSettings } from '../../notifications/native-preparation';
import { ProfileInfo, ProfileRow, profileStyles as styles } from './ProfileDesign';

export function PrivacyExtras() {
  const focused = useIsFocused(), focusedRef = useRef(focused); focusedRef.current = focused;
  const navigation = useNavigation(), role = useAuthStore(s => s.session?.role);
  const [reduced, setReduced] = useState<boolean | null>(null), [helpError, setHelpError] = useState<string | null>(null);
  const ref = useRef<ReturnType<typeof createDeviceSettingsAction> | null>(null);
  if (!ref.current) ref.current = createDeviceSettingsAction({ active: () => focusedRef.current && AppState.currentState === 'active', open: valid => openNotificationSettings(valid, { kind: 'accessibility' }) });
  const controller = ref.current, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    let alive = true, revision = 0, timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (!focusedRef.current || AppState.currentState !== 'active') return;
      controller.suspend(); const current = ++revision; clearTimeout(timer); setReduced(null);
      timer = setTimeout(() => { if (alive && current === revision) { revision++; setReduced(null); } }, 4000);
      void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive && current === revision) { clearTimeout(timer); setReduced(value); } }).catch(() => { if (alive && current === revision) { clearTimeout(timer); setReduced(null); } });
    };
    controller.start(); refresh();
    const app = AppState.addEventListener('change', next => { if (next === 'active') refresh(); else { revision++; clearTimeout(timer); controller.suspend(); } });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { revision++; clearTimeout(timer); setReduced(value); });
    return () => { alive = false; revision++; clearTimeout(timer); app.remove(); motion.remove(); controller.stop(); };
  }, [controller, focused]);
  return <>
    <Text accessibilityRole="header" style={styles.section}>ACCESSIBILITY</Text>
    <ProfileInfo label="Reduce motion — system setting" value={reduced === null ? 'Could not verify yet' : reduced ? 'On — supported animations respect this setting' : 'Off'} icon="eye" />
    <ProfileRow testID="profile-accessibility-settings" title={state.busy ? 'Opening settings...' : 'Accessibility settings'} subtitle="Open Android accessibility controls. Search for Remove animations or text size; no app-only override is applied." icon="smartphone" disabled={state.busy || !focused}
      onPress={() => void controller.run()} />
    {!!state.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text>}
    <View style={styles.notice}><Text accessibilityRole="header" style={styles.section}>HELP & SUPPORT</Text><Text style={styles.noticeText}>Use Resources or Facilitators from More, and Sparty for app guidance where available. Contact authorized campus staff for account corrections or confidential concerns. Sparty is not a counselor.</Text></View>
    {role === 'student' && <ProfileRow testID="profile-help-resources" title="Open Resources" subtitle="Guides and support in the existing Resources destination." icon="help-circle" onPress={() => { try { const parent = navigation.getParent(); if (!parent) throw Error('Destination unavailable'); setHelpError(null); parent.navigate('StudentResources'); } catch { setHelpError('Resources could not be opened here. Use More → Resources.'); } }} />}
    {!!helpError && <Text accessibilityLiveRegion="polite" style={styles.error}>{helpError}</Text>}
  </>;
}
