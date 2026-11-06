import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Device from 'expo-device';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '@spartan-g/shared-services';
import { getFirebaseAuth } from '@spartan-g/shared-services/src/firebase/auth';
import { loadPortalPolicy } from '../../security/portal-policy';
import type { PortalPolicy } from '../../security/policy-consent';
import { PolicyBody } from '../../security/PrivacyConsentGate';
import { currentDeviceDescription } from '../../security/current-device';
import { ProfileHeader, ProfileInfo, ProfileRow, profileStyles as styles } from './ProfileDesign';
import type { ProfileRoutes } from './ProfileNavigator';

export function SessionActivityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileRoutes>>();
  const session = useAuthStore(s => s.session), status = useAuthStore(s => s.status);
  let firebaseUid: string | null = null;
  try { if (status === 'authenticated') firebaseUid = getFirebaseAuth().currentUser?.uid ?? null; } catch { /* Local identity remains unavailable; no broad lookup. */ }
  const info = currentDeviceDescription(status === 'authenticated' ? session : null, firebaseUid, { model: Device.modelName, os: Device.osName, version: Device.osVersion, platform: Platform.OS, isDevice: Device.isDevice });
  return <View style={styles.screen}><ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
    <ProfileHeader title="Session Activity" subtitle="This app's current device and supported security information." back={() => navigation.goBack()} symbol="shield" />
    <View style={styles.body}>
      <View style={styles.notice}><Text testID="local-session-scope" style={styles.noticeText}>LOCAL DEVICE INFORMATION. This is not a server-verified active-session list or a device-trust enrollment. Restored client sign-in is not proof that tokens have not been revoked; Firebase checks authorization when requests are made.</Text></View>
      {!info ? <Text testID="session-unavailable" accessibilityLiveRegion="polite" style={styles.error}>Current account identity is unavailable. No other account or device information is displayed.</Text> : <>
        <Text accessibilityRole="header" style={styles.section}>CURRENT DEVICE - DESCRIPTIVE ONLY</Text>
        <ProfileInfo label="Device model" value={info.model} icon="smartphone" /><ProfileInfo label="Operating system" value={info.operatingSystem} icon="monitor" />
        <ProfileInfo label="Device environment" value={info.physicalDevice ? 'Physical device reported by the operating system' : 'Emulator/simulator reported by the operating system'} icon="cpu" />
        <ProfileInfo label="Current app session" value={info.localSession} icon="user-check" />
        <ProfileInfo label="Recorded sign-in date" value="Not displayed: no reliable device-specific server record" icon="calendar" />
        <ProfileInfo label="Last server-verified activity" value={info.verifiedActivity} icon="clock" />
        <Text accessibilityRole="header" style={styles.section}>TRUSTED DEVICES</Text>
        <ProfileInfo label="Device trust" value={info.trust} icon="shield" /><ProfileInfo label="Other registered devices" value={info.otherDevices} icon="smartphone" />
        <View style={styles.notice}><Text style={styles.noticeText}>{info.revocation}. A push token or client-controlled trusted flag is not device trust. Firebase's Admin refresh-token revocation is user-wide; no remote revocation success is claimed here.</Text></View>
        <ProfileRow testID="session-profile-logout" title="Open Profile for logout" subtitle="Use the existing confirmation to sign out this app. This does not claim to revoke another device." icon="log-out" onPress={() => navigation.navigate('Overview')} />
      </>}
    </View>
  </ScrollView></View>;
}

export function PrivacyPolicyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileRoutes>>();
  const session = useAuthStore(s => s.session);
  const [state, setState] = useState<{ session: typeof session; policy: PortalPolicy | null; error: boolean }>({ session, policy: null, error: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ session, policy: null, error: false });
    const timer = setTimeout(() => { if (alive) { alive = false; setState({ session, policy: null, error: true }); } }, 12000);
    void loadPortalPolicy().then(policy => { if (alive) setState({ session, policy, error: false }); }).catch(() => { if (alive) setState({ session, policy: null, error: true }); }).finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); };
  }, [session, retry]);
  const policy = state.session === session ? state.policy : null;
  return <View style={styles.screen}><ScrollView testID="privacy-policy-scroll" style={styles.scroll} contentContainerStyle={styles.content}>
    <ProfileHeader title="Privacy Policy" subtitle="The policy shared with the web portal." back={() => navigation.goBack()} />
    <View style={styles.body}>
      {policy ? <><Text accessibilityRole="header" style={styles.section}>{policy.title}</Text><Text style={styles.neutral}>Version {policy.version}{policy.version === 0 ? ' · web starter policy' : ''} · Effective date not provided</Text><PolicyBody policy={policy} /></> : state.error ? <><Text accessibilityLiveRegion="polite" style={styles.error}>The current policy could not be loaded. No cached draft is shown as an approved policy.</Text><Pressable accessibilityRole="button" style={styles.action} onPress={() => setRetry(v => v + 1)}><Text style={styles.actionText}>Retry policy</Text></Pressable></> : <ActivityIndicator color="#A51D36" />}
    </View>
  </ScrollView></View>;
}
