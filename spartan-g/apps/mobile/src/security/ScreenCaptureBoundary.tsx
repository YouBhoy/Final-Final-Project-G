import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { consentToPrivateDocumentation, privateDocumentationBuild, privateDocumentationCapture, revokePrivateDocumentation, screenPrivacy } from './screen-privacy';
import { isPresentationScreen } from './screenshot-policy';

function ProtectedScreen({ name, children }: { name: string; children: ReactNode }) {
  const focused = useIsFocused();
  const state = useSyncExternalStore(screenPrivacy.subscribe, screenPrivacy.getSnapshot, screenPrivacy.getSnapshot);
  const mountedOnce = useRef(false);
  useLayoutEffect(() => focused ? screenPrivacy.enterScreen(name) : undefined, [focused, name]);
  const visible = isPresentationScreen(name) || (state.ready && (state.protected || privateDocumentationCapture?.() === true));
  // Retain already mounted forms while covered; never mount private content
  // for the first time before FLAG_SECURE has been acknowledged.
  if (visible) mountedOnce.current = true;
  return <View style={styles.fill}>
    <View pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[styles.fill, !visible && styles.hidden]}>{mountedOnce.current ? children : null}</View>
    {!visible && <View testID="screen-privacy-cover" style={[StyleSheet.absoluteFillObject, styles.cover]}><Text>{state.error ? 'Screen privacy is unavailable. Return to Home and try again.' : 'Protecting your private screen…'}</Text></View>}
  </View>;
}

export function CaptureScreenLayout({ name, children }: { name: string; children: unknown }) {
  // Navigation supplies a React element through its own React type namespace.
  // Forward that opaque element unchanged without upgrading either dependency.
  const content = children as ReactNode;
  if (Platform.OS !== 'android' || name === 'Student' || name === 'StudentTabs') return <>{content}</>;
  return <ProtectedScreen name={name}>{content}</ProtectedScreen>;
}

/** A private Modal is not mounted until Android acknowledges protection. */
export function useSensitiveCapture(visible: boolean) {
  const state = useSyncExternalStore(screenPrivacy.subscribe, screenPrivacy.getSnapshot, screenPrivacy.getSnapshot);
  useLayoutEffect(() => visible && Platform.OS === 'android' ? screenPrivacy.enterSensitiveOverlay() : undefined, [visible]);
  return Platform.OS !== 'android' || (state.ready && (state.protected || privateDocumentationCapture?.() === true));
}

/** No remote/user-settings switch: native opt-in plus fresh foreground consent. */
export function PrivateDocumentationGate({ children }: { children: ReactNode }) {
  const [consented, setConsented] = useState(false);
  const mountedOnce = useRef(false);
  useEffect(() => {
    if (!privateDocumentationBuild) return;
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') { revokePrivateDocumentation(); setConsented(false); }
    });
    return () => { subscription.remove(); revokePrivateDocumentation(); };
  }, []);
  if (!privateDocumentationBuild) return <>{children}</>;
  if (consented) mountedOnce.current = true;
  // Re-consent covers existing navigation instead of destroying forms/drafts.
  return <View style={styles.fill}>
    <View pointerEvents={consented ? 'auto' : 'none'} accessibilityElementsHidden={!consented} importantForAccessibility={consented ? 'auto' : 'no-hide-descendants'} style={[styles.fill, !consented && styles.hidden]}>{mountedOnce.current ? children : null}</View>
    {!consented && <View testID="private-documentation-notice" style={[StyleSheet.absoluteFillObject, styles.cover]}>
    <Text style={styles.noticeTitle}>Private manuscript screenshots</Text>
    <Text style={styles.noticeCopy}>This private build permits screenshots of additional student screens and overlays. Use only authorized, non-sensitive demonstration information. Do not capture real screening answers, counseling conversations, identifiers or other confidential records. Never distribute this APK publicly.</Text>
    <Pressable accessibilityRole="button" testID="private-documentation-consent" style={styles.noticeButton} onPress={() => {
      if (AppState.currentState === 'active' && consentToPrivateDocumentation()) setConsented(true);
    }}><Text style={styles.noticeButtonText}>Continue with non-sensitive demonstration information</Text></Pressable>
    </View>}
  </View>;
}

const stackTransitions = new Set<string>();
export const captureStackTransitions = {
  transitionStart: (event: { target?: string }) => { const key = event.target ?? 'student-stack'; stackTransitions.add(key); screenPrivacy.transition(key, true); },
  transitionEnd: (event: { target?: string }) => { const key = event.target ?? 'student-stack'; stackTransitions.delete(key); screenPrivacy.transition(key, false); },
};
export function clearCaptureTransitions() { stackTransitions.forEach(key => screenPrivacy.transition(key, false)); stackTransitions.clear(); }
const styles = StyleSheet.create({ fill: { flex: 1 }, hidden: { opacity: 0 }, cover: { backgroundColor: '#FFFAF5', padding: 24, alignItems: 'center', justifyContent: 'center' }, noticeTitle: { color: '#991B1B', fontSize: 24, fontWeight: '700', marginBottom: 16 }, noticeCopy: { color: '#334155', fontSize: 16, lineHeight: 24 }, noticeButton: { marginTop: 24, padding: 16, borderRadius: 16, backgroundColor: '#991B1B' }, noticeButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' } });
