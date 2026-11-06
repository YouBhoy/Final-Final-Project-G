import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProfileHeader } from '../screens/profile/ProfileDesign';

interface Props {
  account: string | null;
  role: string | null;
  loading: boolean;
  busy: boolean;
  background: boolean;
  canUnlock: boolean;
  error: string | null;
  onUnlock(): void;
  onRecover(): void;
  onRetry?: () => void;
  signInRequired?: boolean;
  onRestoreFingerprint?: () => void;
  onRestoreLock?: () => void;
}

/** No profile/data reads, navigation container, automatic prompt or credential storage. */
export function WelcomeBackScreen(props: Props) {
  return <ScrollView testID="quick-login-scroll" contentContainerStyle={s.content} bounces={false}>
    <ProfileHeader title="Welcome back" subtitle="Your Spartan-G account, securely protected." />
    <View style={s.card}>
      <View style={s.brand}><Image source={require('../../assets/Batangas_State_Logo.png')} style={s.logo} resizeMode="contain" accessibilityIgnoresInvertColors /><Text style={s.brandName}>SPARTAN-G</Text></View>
      <Text accessibilityRole="header" style={s.title}>{props.loading ? 'Preparing your account' : props.signInRequired ? 'Verify your sign-in' : 'Welcome back, Spartan'}</Text>
      <Text style={s.subtitle}>{props.signInRequired ? 'Firebase sign-in succeeded. Complete your local fingerprint check.' : 'Continue your existing Firebase session.'}</Text>
      <View testID="quick-login-account" style={s.account}><MaterialCommunityIcons name="account-check-outline" size={23} color="#A50926" /><View style={s.accountCopy}><Text style={s.accountLabel}>{props.role ? `${props.role} account` : 'Account verification required'}</Text><Text style={s.accountText}>{props.account || 'Confirm your account to continue'}</Text></View></View>
      {props.canUnlock && <View style={s.fingerprint} accessible={false} importantForAccessibility="no"><MaterialCommunityIcons name="fingerprint" size={96} color="#AF102D" /></View>}
      <Text style={s.explanation}>{props.canUnlock ? 'Your saved security setting requires verification. Tap Unlock to start one OS fingerprint check; Firebase confirms the session online.' : 'Checking your saved security preferences. Fingerprint verification starts only for an enabled setting and an explicit action.'}</Text>
      {props.busy || props.loading ? <View style={s.progress} accessibilityLiveRegion="polite"><ActivityIndicator color="#AF102D" /><Text style={s.help}>Verifying your account...</Text></View> : null}
      {!!props.error && <Text testID="quick-login-error" accessibilityLiveRegion="assertive" style={s.error}>{props.error}</Text>}
      {props.background ? <Text style={s.help}>Return to Spartan-G to continue.</Text> : <>
        {props.canUnlock && <Pressable testID="app-lock-unlock" accessibilityRole="button" accessibilityState={{ disabled: props.busy }} disabled={props.busy} style={[s.primary, props.busy && s.disabled]} onPress={props.onUnlock}><MaterialCommunityIcons name="fingerprint" size={24} color="#FFF" /><Text style={s.primaryText}>Unlock with Fingerprint</Text></Pressable>}
        {props.onRetry && <Pressable testID="app-lock-retry" accessibilityRole="button" disabled={props.busy} style={s.secondary} onPress={props.onRetry}><Text style={s.secondaryText}>Retry local protection check</Text></Pressable>}
        {props.onRestoreFingerprint && <Pressable testID="sign-in-fingerprint-restore" accessibilityRole="button" disabled={props.busy} style={s.secondary} onPress={props.onRestoreFingerprint}><Text style={s.secondaryText}>Update fingerprint protection</Text></Pressable>}
        {props.onRestoreLock && <Pressable testID="lock-fingerprint-restore" accessibilityRole="button" disabled={props.busy} style={s.primary} onPress={props.onRestoreLock}><Text style={s.primaryText}>Re-enroll saved fingerprint protection</Text></Pressable>}
        <Pressable testID="app-lock-recovery" accessibilityRole="button" disabled={props.busy} accessibilityState={{ disabled: props.busy }} style={s.secondary} onPress={props.onRecover}><Text style={s.secondaryText}>{props.signInRequired ? 'Sign out safely' : 'Use email and password instead'}</Text></Pressable>
        <Text style={s.help}>{props.signInRequired ? 'Signing out keeps Require Fingerprint After Sign-In enabled. Updating an invalidated proof requires fresh Firebase credentials and a new strong OS fingerprint check. Cancellation never opens the portal.' : 'This signs out this app and opens the normal Firebase login. Your email and password must be verified again. Any enabled after-sign-in fingerprint requirement still applies. No data needs to be cleared.'}</Text>
      </>}
    </View>
    <Text style={s.footer}>Local fingerprint checks require an internet connection for Firebase session validation. This is not Firebase MFA and does not save passwords.</Text>
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { flexGrow: 1, paddingBottom: 24, backgroundColor: '#FFF7F8' },
  card: { marginHorizontal: 18, marginTop: -14, padding: 22, gap: 16, borderRadius: 28, backgroundColor: '#FFF', shadowColor: '#6C2031', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.09, shadowRadius: 16, elevation: 3 },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, logo: { width: 44, height: 44 }, brandName: { color: '#A50926', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#141E30', fontSize: 26, fontWeight: '800', textAlign: 'center' }, subtitle: { color: '#637188', fontSize: 15, textAlign: 'center' },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: '#FFF0F2' }, accountCopy: { flex: 1, minWidth: 0 }, accountLabel: { color: '#805361', fontSize: 12, marginBottom: 4 }, accountText: { color: '#182238', fontSize: 15, fontWeight: '600' },
  fingerprint: { width: 138, height: 138, borderRadius: 69, backgroundColor: '#FFF0F3', borderWidth: 1, borderColor: '#F7D8DF', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginVertical: 4 },
  explanation: { color: '#536278', fontSize: 14, lineHeight: 22, textAlign: 'center' }, progress: { gap: 8 }, help: { color: '#667489', fontSize: 12, lineHeight: 19, textAlign: 'center' },
  primary: { minHeight: 56, paddingVertical: 15, paddingHorizontal: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#BA102F' }, primaryText: { color: '#FFF', fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'center' }, disabled: { opacity: 0.55 },
  secondary: { minHeight: 50, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#F0D4DB', alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: '#A50926', fontSize: 14, fontWeight: '600', textAlign: 'center' }, error: { color: '#A50926', backgroundColor: '#FFF1F3', borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 21 }, footer: { marginTop: 20, marginHorizontal: 30, fontSize: 12, color: '#7C6470', lineHeight: 19, textAlign: 'center' },
});
