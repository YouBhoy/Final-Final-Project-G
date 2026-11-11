import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** Remain still until the platform preference is known, including read failure. */
export function useReducedMotionPreference() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true, revision = 0;
    const initial = revision;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (alive && initial === revision) setReduced(value);
    }).catch(() => { /* Keep the conservative static state. */ });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      revision++; if (alive) setReduced(value);
    });
    return () => { alive = false; subscription.remove(); };
  }, []);
  return reduced;
}

export function useWelcomeMotion() {
  const reduced = useReducedMotionPreference(), focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const entrance = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const entered = useRef(false), feedback = useRef<Animated.CompositeAnimation | null>(null);
  const allowed = !reduced && focused && foreground;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!allowed) { entrance.stopAnimation(); entrance.setValue(1); return; }
    if (entered.current) return;
    entered.current = true; entrance.setValue(0);
    const animation = Animated.timing(entrance, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false });
    animation.start();
    return () => { animation.stop(); entrance.setValue(1); };
  }, [allowed, entrance]);
  useEffect(() => {
    if (!allowed) { feedback.current?.stop(); scale.setValue(1); }
    return () => { feedback.current?.stop(); scale.setValue(1); };
  }, [allowed, scale]);
  function press(toValue: number) {
    feedback.current?.stop();
    if (!allowed) { scale.setValue(1); return; }
    feedback.current = Animated.timing(scale, { toValue, duration: 100, useNativeDriver: true, isInteraction: false });
    feedback.current.start();
  }
  return { entrance, scale, press, focused };
}
