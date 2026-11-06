import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** A single native clock drives the flag, path light and ambient leaves. */
export function useDashboardMotion(owner: string | null, activeJourney: boolean, mascotReady: boolean) {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduced, setReduced] = useState(true);
  const [resolved, setResolved] = useState(false);
  const header = useRef(new Animated.Value(1)).current;
  const journey = useRef(new Animated.Value(1)).current;
  const cards = useRef(new Animated.Value(1)).current;
  const info = useRef(new Animated.Value(1)).current;
  const mascot = useRef(new Animated.Value(1)).current;
  const ambient = useRef(new Animated.Value(0)).current;
  const entered = useRef<string | null>(null);
  const greeting = useRef<string | null>(null);
  const allowed = !!owner && focused && foreground && resolved && !reduced;

  useEffect(() => {
    let live = true;
    const change = (value: boolean) => { if (live) { setReduced(value); setResolved(true); } };
    void AccessibilityInfo.isReduceMotionEnabled().then(change).catch(() => change(true));
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', change);
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { live = false; motion.remove(); app.remove(); };
  }, []);

  useEffect(() => {
    const values = [header, journey, cards, info];
    if (!allowed) { values.forEach(value => { value.stopAnimation(); value.setValue(1); }); return; }
    if (entered.current === owner) return;
    entered.current = owner;
    values.forEach(value => value.setValue(0));
    const entrance = Animated.stagger(65, values.map(value => Animated.timing(value, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true })));
    entrance.start();
    return () => { entrance.stop(); values.forEach(value => value.setValue(1)); };
  }, [allowed, owner, header, journey, cards, info]);

  useEffect(() => {
    if (!mascotReady) return;
    // If a cached image loads before the motion preference, keep it static
    // rather than fading an already visible character out again afterward.
    if (!resolved) { greeting.current = owner; mascot.setValue(1); return; }
    if (!allowed || greeting.current === owner) { mascot.setValue(1); return; }
    greeting.current = owner;
    mascot.setValue(0);
    const hello = Animated.timing(mascot, { toValue: 1, duration: 640, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    hello.start();
    return () => { hello.stop(); mascot.setValue(1); };
  }, [allowed, owner, mascot, mascotReady, resolved]);

  useEffect(() => {
    if (!allowed || !activeJourney) { ambient.setValue(0); return; }
    const calm = Animated.loop(Animated.sequence([1, 0].map(toValue => Animated.timing(ambient, { toValue, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }))));
    calm.start();
    return () => { calm.stop(); ambient.setValue(0); };
  }, [allowed, activeJourney, ambient]);
  return { allowed, focused, header, journey, cards, info, mascot, ambient };
}
