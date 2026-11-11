import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { screenPrivacy } from './screen-privacy';
import { isPresentationScreen } from './screenshot-policy';

function ProtectedScreen({ name, children }: { name: string; children: ReactNode }) {
  const focused = useIsFocused();
  const state = useSyncExternalStore(screenPrivacy.subscribe, screenPrivacy.getSnapshot, screenPrivacy.getSnapshot);
  const mountedOnce = useRef(false);
  useLayoutEffect(() => focused ? screenPrivacy.enterScreen(name) : undefined, [focused, name]);
  const visible = isPresentationScreen(name) || (focused && state.ready && state.protected);
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
  if (Platform.OS !== 'android' || ['Auth', 'Student', 'StudentTabs', 'Facilitator', 'FacilitatorTabs'].includes(name)) return <>{content}</>;
  return <ProtectedScreen name={name}>{content}</ProtectedScreen>;
}

/** A private Modal is not mounted until Android acknowledges protection. */
export function useSensitiveCapture(visible: boolean) {
  const focused = useIsFocused();
  const state = useSyncExternalStore(screenPrivacy.subscribe, screenPrivacy.getSnapshot, screenPrivacy.getSnapshot);
  useLayoutEffect(() => visible && focused && Platform.OS === 'android' ? screenPrivacy.enterSensitiveOverlay() : undefined, [visible, focused]);
  return visible && focused && (Platform.OS !== 'android' || (state.ready && state.protected));
}

const stackTransitions = new Set<string>();
export const captureStackTransitions = {
  transitionStart: (event: { target?: string }) => { const key = event.target ?? 'student-stack'; stackTransitions.add(key); screenPrivacy.transition(key, true); },
  transitionEnd: (event: { target?: string }) => { const key = event.target ?? 'student-stack'; stackTransitions.delete(key); screenPrivacy.transition(key, false); },
};
export function clearCaptureTransitions() { stackTransitions.forEach(key => screenPrivacy.transition(key, false)); stackTransitions.clear(); }
const styles = StyleSheet.create({ fill: { flex: 1 }, hidden: { opacity: 0 }, cover: { backgroundColor: '#FFFAF5', padding: 24, alignItems: 'center', justifyContent: 'center' } });
