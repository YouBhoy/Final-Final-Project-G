import type { ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@spartan-g/shared-services';
import { appLock, currentLockActor, securityNative, useAppLock } from './app-lock';
import { WelcomeBackScreen } from './WelcomeBackScreen';
import { BrandedLoadingScreen } from '../components/BrandedLoadingScreen';
import { platformSecurity } from './security-platform';

export function AppSecurityBoundary({ children }: { children: ReactNode }) {
  const state = useAppLock(), actor = currentLockActor();
  const status = useAuthStore(s => s.status), session = useAuthStore(s => s.session);
  const initialized = useAuthStore(s => s.isInitialized);
  const authError = useAuthStore(s => s.error);
  const [recoveryBusy, setRecoveryBusy] = useState(false), [recoveryError, setRecoveryError] = useState<string | null>(null);
  const authenticated = status === 'authenticated' && !!session;
  // Native Modal windows can outlive a transparent/hidden parent View. Remove
  // the protected tree during online confirmation as well as biometric locks.
  const matching = !!actor && actor.owner === state.owner && actor.session === state.session;
  const hardCovered = securityNative && (!initialized || status === 'idle' || status === 'loading' || (authenticated && (!matching || state.phase !== 'ready')));
  const softCovered = securityNative && authenticated && (state.enabled || state.quickLoginPending || state.signInPending) && state.background;
  const covered = hardCovered || softCovered;
  useEffect(() => { platformSecurity.trace?.('js_gate', { covered, hard: hardCovered, authenticated, matching }); }, [covered, hardCovered, authenticated, matching]);
  useEffect(() => () => { platformSecurity.trace?.('js_boundary_unmount'); }, []);
  useEffect(() => { if (!covered) return; const back = BackHandler.addEventListener('hardwareBackPress', () => true); return () => back.remove(); }, [covered]);
  const recover = async () => {
    platformSecurity.trace?.('js_ui_recover');
    if (state.busy || recoveryBusy) return;
    if (actor && state.owner === actor.owner && state.phase !== 'loading') { await appLock.recover(); return; }
    // Expired/mismatched client identity must still offer explicit sign-out, never content access.
    setRecoveryBusy(true); setRecoveryError(null);
    try { await useAuthStore.getState().signOut({ preserveScreen: true }); }
    catch { setRecoveryError('Sign-out failed. Protected content remains closed. Retry when Firebase Auth is available.'); }
    finally { setRecoveryBusy(false); }
  };
  if (!covered) return state.cleanupError && !authenticated ? <View style={{ flex: 1 }}><View accessibilityLiveRegion="polite" style={{ padding: 14, backgroundColor: '#FFF3F4' }}><Text style={s.error}>{state.cleanupError}</Text><Pressable accessibilityRole="button" style={s.secondary} onPress={() => void appLock.retryCleanup()}><Text style={s.secondaryText}>Retry local lock cleanup</Text></Pressable></View><View style={{ flex: 1 }}>{children}</View></View> : children;
  if (!hardCovered) return <View style={{ flex: 1 }}><View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, opacity: 0 }}>{children}</View><View testID="app-lock-background-shield" style={[StyleSheet.absoluteFillObject, s.screen]}><Text style={[s.copy, { padding: 26 }]}>Spartan-G is paused.</Text></View></View>;
  const initializationFailed = !initialized && status === 'idle' && !!authError;
  const waiting = !initializationFailed && (!initialized || status === 'idle' || status === 'loading' || !matching || state.phase === 'loading' || state.phase === 'checking');
  // Auth and policy readiness are independent. Keep the exact hard cover, but
  // do not present a biometric workflow before a requirement is established.
  // Unknown policy is still covered; it is never treated as OFF to skip waiting.
  if (waiting) return <View testID="app-lock-gate" style={{ flex: 1 }}><View testID="security-policy-loading" style={{ flex: 1 }}><BrandedLoadingScreen>
    {!!recoveryError && <View style={s.secondary}><Text accessibilityLiveRegion="assertive" style={s.error}>{recoveryError}</Text></View>}
    <Pressable testID="security-loading-recovery" accessibilityRole="button" accessibilityState={{ disabled: state.busy || recoveryBusy }} disabled={state.busy || recoveryBusy} style={s.secondary} onPress={() => void recover()}><Text style={s.secondaryText}>Sign out safely</Text></Pressable>
  </BrandedLoadingScreen></View></View>;
  // Remove protected native screens/modals on a hard lock: no inaccessible-looking content behind a cover.
  return <SafeAreaView testID="app-lock-gate" style={s.screen}><WelcomeBackScreen
    account={matching ? session?.email ?? null : null}
    role={matching ? session?.role === 'facilitator' ? 'Facilitator' : 'Student' : null}
    loading={state.phase === 'loading' || state.phase === 'checking'} busy={state.busy || recoveryBusy} background={state.background}
    canUnlock={matching && (state.signInPending || (state.enrolled && (state.enabled || state.quickLoginPending))) && state.phase === 'locked'} error={recoveryError || state.error || (!initialized ? authError : null)}
    onUnlock={() => { platformSecurity.trace?.('js_ui_unlock'); void appLock.unlock(); }} onRecover={() => void recover()}
    signInRequired={state.signInPending}
    onRestoreFingerprint={matching && state.canRestoreSignIn ? () => void appLock.restoreSignInFingerprint() : undefined}
    onRestoreLock={matching && state.canRestoreLock && !state.signInPending ? () => void appLock.restoreLockEnrollment() : undefined}
    onRetry={!initialized && status === 'idle' && !!authError ? () => { useAuthStore.getState().initialize(); } : state.phase === 'error' ? () => void appLock.activate(currentLockActor()) : undefined}
  /></SafeAreaView>;
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#FFF3F4' }, copy: { color: '#46546D', fontSize: 15, lineHeight: 23 }, error: { color: '#991B1B', fontSize: 14, lineHeight: 22 }, secondary: { minHeight: 48, borderRadius: 16, backgroundColor: '#FCE8EA', padding: 14, alignItems: 'center' }, secondaryText: { color: '#991B1B', fontSize: 15, fontWeight: '600' } });
