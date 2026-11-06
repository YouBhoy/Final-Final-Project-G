import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAuthStore } from '@spartan-g/shared-services';
import { createLogoutController, type LogoutState } from '../../profile/logout-controller';
import { currentPreferenceOwner } from '../../profile/preferences';
import { SpartanLogoutScene, useLogoutMotion } from './SpartanLogoutScene';

export function LogoutConfirmation({ owner, onDismiss }: { owner: string; onDismiss: () => void }) {
  const { height } = useWindowDimensions();
  const [state, setState] = useState<LogoutState>({ busy: false, stage: 'idle', error: null });
  const title = useRef<Text>(null), motion = useLogoutMotion(), latest = useRef(motion); latest.current = motion;
  const authOwner = useAuthStore(s => s.status === 'authenticated' && s.session ? `${s.session.role}:${s.session.uid}` : null);
  const controller = useMemo(() => createLogoutController({ owner, getOwner: currentPreferenceOwner,
    signOut: () => useAuthStore.getState().signOut({ preserveScreen: true }),
    play: stage => latest.current.play(stage), stop: () => latest.current.stop(), changed: setState,
  }), [owner]);
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => { if (authOwner !== owner) { controller.dispose(); onDismiss(); } }, [authOwner, owner, controller, onDismiss]);
  const dismiss = () => { if (!controller.isBusy()) onDismiss(); };
  const focus = () => { const handle = findNodeHandle(title.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); };
  useEffect(() => { if (state.stage === 'error') latest.current.reset(); }, [state.stage]);
  return <Modal testID="profile-logout-modal" visible transparent animationType={motion.reducedMotion ? 'none' : 'fade'} onShow={focus} onRequestClose={dismiss}>
    <View style={styles.overlay}><Pressable testID="logout-backdrop" style={StyleSheet.absoluteFillObject} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Cancel logout" disabled={state.busy} />
      <View style={[styles.card, { maxHeight: Math.max(180, height - 48) }]} accessibilityViewIsModal onAccessibilityEscape={dismiss}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <SpartanLogoutScene motion={motion} />
          <Text ref={title} accessible accessibilityRole="header" style={styles.title}>Log out?</Text>
          <Text style={styles.message}>Are you sure you want to log out?</Text>
          <Text style={styles.caption}>You will be signed out from this device.</Text>
          {state.busy && <Text testID="logout-progress" style={styles.progress} accessibilityLiveRegion="polite">{state.stage === 'signing-out' ? 'Confirming sign-out...' : 'Preparing sign-out...'}</Text>}
          {!!state.error && <Text testID="logout-error" style={styles.error} accessibilityLiveRegion="assertive">{state.error}</Text>}
          <View style={styles.actions}><Pressable testID="logout-no" style={[styles.button, styles.no]} accessibilityRole="button" accessibilityState={{ disabled: state.busy }} disabled={state.busy} onPress={dismiss}><Text style={styles.noText}>No</Text></Pressable>
            <Pressable testID="logout-confirm" style={[styles.button, styles.yes, state.busy && { opacity: 0.65 }]} accessibilityRole="button" accessibilityState={{ disabled: state.busy, busy: state.busy }} disabled={state.busy} onPress={() => void controller.confirm()}><Text style={styles.yesText}>{state.busy ? 'Please wait...' : 'Yes, log out'}</Text></Pressable></View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(24,13,24,0.47)', padding: 20 }, card: { width: '100%', maxWidth: 366, borderRadius: 27, backgroundColor: '#FFFFFF', overflow: 'hidden', elevation: 10, shadowColor: '#3F1424', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 7 }, shadowRadius: 18 }, content: { padding: 21, gap: 10 }, title: { fontSize: 24, fontWeight: '700', color: '#101A32', textAlign: 'center', marginTop: 8 }, message: { fontSize: 16, fontWeight: '600', color: '#101A32', textAlign: 'center', lineHeight: 24 }, caption: { fontSize: 13, lineHeight: 20, color: '#66748C', textAlign: 'center' }, progress: { color: '#991B1B', fontSize: 13, textAlign: 'center' }, error: { color: '#A51D3B', fontSize: 13, lineHeight: 20, textAlign: 'center' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 12 }, button: { minHeight: 48, minWidth: 90, flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 12 }, no: { backgroundColor: '#FDE9ED' }, yes: { backgroundColor: '#DC1735' }, noText: { color: '#A11A32', fontWeight: '600', fontSize: 14 }, yesText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 } });
