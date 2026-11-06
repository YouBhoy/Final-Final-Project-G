import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@spartan-g/shared-services';
import { currentPolicyActor, makePortalConsent } from './portal-policy';
import type { PortalPolicy } from './policy-consent';

export function PolicyBody({ policy }: { policy: PortalPolicy }) {
  return <View style={{ gap: 18 }}>{policy.body.split(/\n\s*\n/).map((paragraph, i) => {
    const lines = paragraph.split('\n'), heading = lines.length > 1 && lines[0] === lines[0].toUpperCase();
    return <View key={i} style={{ gap: 7 }}>{heading && <Text accessibilityRole="header" style={s.section}>{lines[0]}</Text>}<Text selectable style={s.copy}>{heading ? lines.slice(1).join('\n') : paragraph}</Text></View>;
  })}</View>;
}
function useRequiredPolicy() {
  const controller = useMemo(makePortalConsent, []);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [agreed, setAgreed] = useState(false), [exitError, setExitError] = useState<string | null>(null), [exiting, setExiting] = useState(false);
  useEffect(() => { void controller.check(); return () => controller.dispose(); }, [controller]);
  useEffect(() => { if (state.phase === 'accepted') return; const subscription = BackHandler.addEventListener('hardwareBackPress', () => true); return () => subscription.remove(); }, [state.phase]);
  // This component is only the gate; accepted children are rendered by its parent via a callback below.
  const consentActor = currentPolicyActor();
  const ready = consentActor?.owner === state.owner && state.phase === 'accepted';
  return { controller, state, ready, agreed, setAgreed, exiting, exitError, async decline() {
    if (exiting || state.phase === 'saving') return;
    setExiting(true); setExitError(null);
    try { await useAuthStore.getState().signOut({ preserveScreen: true }); }
    catch { setExitError('Sign-out failed. Access remains closed. Please try again.'); }
    finally { setExiting(false); }
  } };
}
function AuthenticatedPolicy({ children }: { children: ReactNode }) {
  const gate = useRequiredPolicy(), { state } = gate;
  if (gate.ready) return <>{children}</>;
  const busy = state.phase === 'loading' || state.phase === 'saving' || gate.exiting;
  return <SafeAreaView testID="mandatory-privacy-gate" style={s.screen}>
    <Text style={s.brand}>SPARTAN-G</Text><Text accessibilityRole="header" style={s.title}>{state.policy?.title ?? 'Privacy Policy'}</Text>
    <Text style={s.caption}>{state.policy ? state.policy.version === 0 ? 'Web starter policy · version 0' : `Policy version ${state.policy.version}` : 'Checking the current policy…'} · Effective date not provided</Text>
    <ScrollView testID="mandatory-policy-scroll" style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 20, gap: 18 }}>
      {state.policy ? <PolicyBody policy={state.policy} /> : <Text style={s.copy}>The policy must be loaded and reviewed before entering the portal. A failed check does not count as agreement.</Text>}
      {!!state.error && <Text accessibilityLiveRegion="assertive" style={s.error}>{state.error}</Text>}
      {!!gate.exitError && <Text accessibilityLiveRegion="assertive" style={s.error}>{gate.exitError}</Text>}
    </ScrollView>
    {state.phase === 'loading' && <ActivityIndicator color="#A51D36" accessibilityLabel="Loading privacy policy" />}
    {state.phase === 'error' && <Pressable accessibilityRole="button" style={s.secondary} onPress={() => { gate.setAgreed(false); void gate.controller.check(); }}><Text style={s.secondaryText}>Retry policy check</Text></Pressable>}
    {!!state.policy && <Pressable accessibilityRole="checkbox" accessibilityLabel="I have read and agree to the privacy policy" accessibilityState={{ checked: gate.agreed, disabled: busy }} disabled={busy} onPress={() => gate.setAgreed(!gate.agreed)} style={s.agreement}><Text style={s.secondaryText}>{gate.agreed ? '☑' : '☐'} I have read and agree to this policy.</Text></Pressable>}
    <Pressable testID="accept-privacy-policy" accessibilityRole="button" disabled={!gate.agreed || state.phase !== 'review' || busy} accessibilityState={{ disabled: !gate.agreed || state.phase !== 'review' || busy, busy }} onPress={() => void gate.controller.accept(gate.agreed)} style={[s.primary, (!gate.agreed || state.phase !== 'review' || busy) && { opacity: 0.5 }]}><Text style={s.primaryText}>{state.phase === 'saving' ? 'Saving acknowledgement…' : 'I Agree'}</Text></Pressable>
    <Pressable testID="decline-privacy-policy" accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} style={s.secondary} onPress={() => void gate.decline()}><Text style={s.secondaryText}>Decline and sign out</Text></Pressable>
    <Text style={s.caption}>Declining signs you out without deleting your account. You will be asked again at your next sign-in, as in the web portal.</Text>
  </SafeAreaView>;
}
export function PrivacyConsentGate({ children }: { children: ReactNode }) {
  const session = useAuthStore(s => s.session), status = useAuthStore(s => s.status);
  // Matches main: students and facilitators acknowledge; auth routes and the separate admin portal do not.
  if (status !== 'authenticated' || !session || !['student', 'facilitator'].includes(session.role)) return <>{children}</>;
  return <AuthenticatedPolicy key={JSON.stringify([session.uid, currentPolicyActor()?.owner])}>{children}</AuthenticatedPolicy>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#FFFAF5', padding: 22, gap: 10 }, brand: { color: '#BB1731', fontSize: 18, fontWeight: '800' }, title: { fontSize: 27, color: '#172238', fontWeight: '700' }, section: { fontSize: 16, lineHeight: 23, color: '#8F1D34', fontWeight: '700' }, copy: { color: '#34435A', fontSize: 16, lineHeight: 25 }, caption: { fontSize: 12, lineHeight: 18, color: '#667085' }, error: { color: '#9D1C35', fontSize: 14, lineHeight: 22 }, primary: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: '#B71935', alignItems: 'center' }, primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 }, secondary: { minHeight: 44, padding: 10, alignItems: 'center' }, secondaryText: { color: '#94213A', fontSize: 15, lineHeight: 23 }, agreement: { minHeight: 48, paddingVertical: 10 } });
