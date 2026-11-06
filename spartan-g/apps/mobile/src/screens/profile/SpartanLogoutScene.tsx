import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Path, Rect, Ellipse, Circle, G } from 'react-native-svg';
import type { LogoutStage } from '../../profile/logout-controller';

export function useLogoutMotion() {
  const focused = useIsFocused();
  const [reducedMotion, setReducedMotion] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const travel = useRef(new Animated.Value(0)).current, gait = useRef(new Animated.Value(0)).current;
  const door = useRef(new Animated.Value(0)).current, glow = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current, reach = useRef(new Animated.Value(0)).current, breath = useRef(new Animated.Value(0)).current;
  const active = useRef<Animated.CompositeAnimation | null>(null), settle = useRef<(() => void) | null>(null), playing = useRef(false);
  const idleAnimation = useRef<Animated.CompositeAnimation | null>(null), generation = useRef(0);
  const preferences = useRef({ reducedMotion, foreground, focused }); preferences.current = { reducedMotion, foreground, focused };
  const stop = useCallback(() => { generation.current++; idleAnimation.current?.stop(); idleAnimation.current = null; active.current?.stop(); active.current = null; settle.current?.(); settle.current = null; }, []);
  const reset = useCallback(() => { travel.setValue(0); gait.setValue(0); door.setValue(0); glow.setValue(0); fade.setValue(1); reach.setValue(0); breath.setValue(0); }, [travel, gait, door, glow, fade, reach, breath]);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReducedMotion(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const state = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { alive = false; motion.remove(); state.remove(); stop(); };
  }, [stop]);
  useEffect(() => { if (!foreground || !focused || reducedMotion) stop(); }, [foreground, focused, reducedMotion, stop]);
  useEffect(() => {
    if (reducedMotion || !foreground || !focused || playing.current) return;
    const idle = Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 1250, useNativeDriver: true, isInteraction: false }),
      Animated.timing(breath, { toValue: 0, duration: 1250, useNativeDriver: true, isInteraction: false }),
    ]));
    idleAnimation.current = idle;
    idle.start(); return () => { idle.stop(); if (idleAnimation.current === idle) idleAnimation.current = null; breath.stopAnimation(); };
  }, [reducedMotion, foreground, focused, breath]);
  const run = (animation: Animated.CompositeAnimation) => new Promise<void>(resolve => {
    active.current = animation;
    const done = () => { if (settle.current === done) settle.current = null; resolve(); };
    settle.current = done; animation.start(done);
  });
  const timing = (value: Animated.Value, toValue: number, duration: number) => Animated.timing(value, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false });
  const steps = (duration: number) => Animated.sequence([1, -1, 1, -1, 1, 0].map(toValue => timing(gait, toValue, duration / 6)));
  async function play(stage: (stage: LogoutStage) => void) {
    stop(); reset(); playing.current = true;
    const token = generation.current;
    const allowed = () => token === generation.current && preferences.current.foreground && preferences.current.focused && !preferences.current.reducedMotion;
    try {
      if (!allowed()) { await run(timing(fade, 0, preferences.current.reducedMotion ? 160 : 0)); return; }
      stage('walk'); await run(Animated.parallel([timing(travel, 1, 720), steps(720)]));
      if (!allowed()) return;
      stage('open'); await run(Animated.parallel([timing(door, 1, 330), timing(glow, 1, 330), timing(reach, 1, 220)]));
      if (!allowed()) return;
      await run(Animated.delay(100));
      if (!allowed()) return;
      stage('exit'); await run(Animated.parallel([timing(travel, 2, 540), steps(540), timing(fade, 0, 540), timing(reach, 0, 210)]));
      if (!allowed()) return;
      stage('goodbye'); await run(Animated.parallel([timing(door, 0, 250), timing(glow, 0, 250)]));
    } finally { playing.current = false; active.current = null; }
  }
  return { travel, gait, door, glow, fade, reach, breath, reducedMotion, play, stop, reset };
}
export type LogoutMotion = ReturnType<typeof useLogoutMotion>;

/** Original articulated miniature. The global Sparty image is never replaced. */
export function SpartanLogoutScene({ motion }: { motion: LogoutMotion }) {
  const { width } = useWindowDimensions();
  const scale = Math.min(1, Math.max(0.58, (width - 92) / 280));
  const gaitAngle = motion.gait.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-20deg', '0deg', '20deg'] });
  const opposite = motion.gait.interpolate({ inputRange: [-1, 0, 1], outputRange: ['20deg', '0deg', '-20deg'] });
  return <View testID="spartan-logout-scene" pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: 280 * scale, height: 180 * scale, alignSelf: 'center' }}>
    <View style={[art.stage, { transform: [{ scale }], marginLeft: (280 * scale - 280) / 2, marginTop: (180 * scale - 180) / 2 }]}>
      <Svg width="280" height="180" viewBox="0 0 280 180" style={StyleSheet.absoluteFillObject}>
        <Defs><LinearGradient id="logoutStageRose" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFF4F4" /><Stop offset="1" stopColor="#FFFDF8" /></LinearGradient></Defs>
        <Rect width="280" height="180" rx="20" fill="url(#logoutStageRose)" /><Ellipse cx="145" cy="157" rx="121" ry="11" fill="#EBC6C6" opacity={0.58} />
        <Path d="M181 19L254 9V154L181 159Z" fill="#753139" stroke="#55232B" strokeWidth="3" /><Path d="M188 24L246 16V150L188 153Z" fill="#402A2D" />
      </Svg>
      <Animated.View testID="logout-door-light" style={[art.light, { opacity: motion.glow }]}>
        <Svg width="110" height="160" viewBox="0 0 110 160"><Defs><RadialGradient id="logoutWarmLight" cx="60%" cy="50%" rx="65%" ry="60%"><Stop offset="0" stopColor="#FFFAC8" /><Stop offset="1" stopColor="#FFD076" stopOpacity="0" /></RadialGradient></Defs><Rect width="110" height="160" fill="url(#logoutWarmLight)" /><Path d="M39 17L97 8V143L39 148Z" fill="#FFF1B4" /></Svg>
      </Animated.View>
      <Animated.View testID="logout-spartan-traveler" style={[art.actor, { opacity: motion.fade, transform: [{ translateX: motion.travel.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 108, 174] }) }, { translateY: motion.gait.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, -2, 0] }) }, { translateY: motion.breath.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] }) }, { scale: motion.travel.interpolate({ inputRange: [0, 1, 2], outputRange: [1, 1, 0.82] }) }] }]}>
        <Animated.View testID="logout-spartan-cape" style={[art.cape, { transform: [{ rotate: motion.gait.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-7deg', '0deg', '7deg'] }) }] }]}>
          <Svg width="80" height="99" viewBox="0 0 80 99"><Defs><LinearGradient id="logoutCapeRed" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#F14B51" /><Stop offset="1" stopColor="#8A1326" /></LinearGradient></Defs><Path d="M31 4Q48 2 59 15L72 88Q58 80 47 94Q37 80 19 91L6 85Q26 48 22 16Z" fill="url(#logoutCapeRed)" stroke="#541E2A" strokeWidth="2.5" /><Path d="M34 14L28 77M47 19L52 80" stroke="#FF8C86" strokeWidth="3" opacity={0.45} /></Svg>
        </Animated.View>
        <Animated.View testID="logout-spartan-leg-left" style={[art.leg, { left: 30, transform: [{ translateY: -17 }, { rotate: gaitAngle }, { translateY: 17 }] }]}><Leg /></Animated.View>
        <Animated.View testID="logout-spartan-leg-right" style={[art.leg, { left: 51, transform: [{ translateY: -17 }, { rotate: opposite }, { translateY: 17 }] }]}><Leg /></Animated.View>
        <Animated.View testID="logout-spartan-arm-back" style={[art.arm, { left: 16, transform: [{ rotate: opposite }] }]}><Arm /></Animated.View>
        <View style={art.torso}><Svg width="62" height="65" viewBox="0 0 62 65"><Defs><LinearGradient id="logoutArmor" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#F15A5E" /><Stop offset="1" stopColor="#9C2036" /></LinearGradient></Defs><Path d="M14 3Q30 -3 46 4L52 34L54 57L42 62L31 55L20 62L8 56L12 31Z" fill="url(#logoutArmor)" stroke="#442A32" strokeWidth="2.5" /><Path d="M18 6Q32 16 44 6L43 23Q31 31 17 23Z" fill="#B3BCC4" stroke="#51414A" strokeWidth="2" /><Path d="M21 10L31 17L40 10M16 35L46 35" fill="none" stroke="#F8D28F" strokeWidth="3" /><Path d="M20 41L17 54M31 42V54M42 41L45 54" stroke="#6C2635" strokeWidth="4" /><Circle cx="31" cy="35" r="4" fill="#E3B268" /></Svg></View>
        <Animated.View testID="logout-spartan-arm-front" style={[art.arm, { left: 63, transform: [{ rotate: motion.reach.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-65deg'] }) }] }]}><Animated.View testID="logout-spartan-arm-front-gait" style={{ transform: [{ rotate: gaitAngle }] }}><Arm /></Animated.View></Animated.View>
        <View style={art.helmet}><Helmet /></View>
      </Animated.View>
      {/* Native perspective panel and foreground jamb occlude the traveler. */}
      <Animated.View testID="logout-door-panel" style={[art.door, { transform: [{ perspective: 600 }, { translateX: -34 }, { rotateY: motion.door.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-78deg'] }) }, { translateX: 34 }] }]}>
        <Svg width="68" height="138" viewBox="0 0 68 138"><Defs><LinearGradient id="logoutDoorWood" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#B85046" /><Stop offset="1" stopColor="#7C2933" /></LinearGradient></Defs><Path d="M1 10L66 1V130L1 137Z" fill="url(#logoutDoorWood)" stroke="#58242D" strokeWidth="2.5" /><Path d="M10 19L56 12V68L10 72ZM10 82L56 78V119L10 126Z" fill="none" stroke="#E38571" strokeWidth="2" /><Circle cx="56" cy="76" r="3.4" fill="#F5CB79" stroke="#713C32" strokeWidth="1" /></Svg>
      </Animated.View>
      <View testID="logout-foreground-jamb" pointerEvents="none" style={art.jamb}><Svg width="27" height="151" viewBox="0 0 27 151"><Path d="M0 3L5 2V148L0 149Z" fill="#5F2931" /><Path d="M5 0H27V151H5Z" fill="#FFF9F5" /></Svg></View>
    </View>
  </View>;
}
function Leg() { return <Svg width="24" height="43" viewBox="0 0 24 43"><Path d="M4 2H18L18 24L21 33Q22 41 14 41H2L3 32L6 23Z" fill="#B94A47" stroke="#4A2C32" strokeWidth="2.3" /><Path d="M7 6L15 6L16 24H5Z" fill="#AEB9C0" stroke="#59606C" strokeWidth="1.5" /><Path d="M3 31Q13 27 19 32L21 38H2Z" fill="#6A3037" /><Path d="M6 8H14" stroke="#F1E5DB" strokeWidth="2" /></Svg>; }
function Arm() { return <Svg width="24" height="47" viewBox="0 0 24 47"><Path d="M5 3Q14 -2 20 8L18 28Q23 37 16 43Q6 46 4 37L7 25L3 12Z" fill="#E9AC87" stroke="#4B2A32" strokeWidth="2.3" /><Path d="M4 7Q14 -2 21 10L18 20L5 17Z" fill="#A9B4BD" stroke="#535464" strokeWidth="2" /><Path d="M6 30L19 31L19 36L5 35Z" fill="#BE3448" /></Svg>; }
function Helmet() { return <Svg width="88" height="87" viewBox="0 0 88 87">
  <Defs><LinearGradient id="logoutHelmetSteel" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#E3E7E8" /><Stop offset="0.5" stopColor="#8D9DA9" /><Stop offset="1" stopColor="#53606D" /></LinearGradient><LinearGradient id="logoutHelmetCrest" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FF6866" /><Stop offset="1" stopColor="#9E2337" /></LinearGradient></Defs>
  <Path d="M19 36Q13 9 40 4Q59 -1 75 12L66 27L48 17L38 31Z" fill="url(#logoutHelmetCrest)" stroke="#492A33" strokeWidth="2.5" /><Path d="M25 14L32 24M37 8L42 19M50 8L53 18M63 11L62 21" stroke="#7C2637" strokeWidth="2" />
  <Path d="M18 35Q34 17 58 29Q77 40 72 63L66 79Q44 90 23 73L14 57Z" fill="#F8C6A0" stroke="#4E3036" strokeWidth="2.5" />
  <Path d="M15 44Q13 20 42 20Q71 19 78 46L73 70L63 77L60 49L27 46L28 74L18 68Z" fill="url(#logoutHelmetSteel)" stroke="#3B3744" strokeWidth="3" />
  <Path d="M17 42Q41 25 74 43L73 50L17 47Z" fill="#A32D40" stroke="#583441" strokeWidth="2" /><Path d="M42 23L44 45" stroke="#F2E8D5" strokeWidth="3" />
  <Ellipse cx="38" cy="58" rx="7" ry="9" fill="#1D2735" /><Ellipse cx="57" cy="59" rx="7" ry="9" fill="#1D2735" /><Circle cx="40" cy="55" r="2.7" fill="#FFFFFF" /><Circle cx="59" cy="56" r="2.7" fill="#FFFFFF" />
  <Path d="M31 49Q38 44 45 49M51 49Q58 45 65 51" fill="none" stroke="#513038" strokeWidth="2.3" strokeLinecap="round" /><Path d="M43 73Q49 78 54 72" fill="none" stroke="#914851" strokeWidth="2" strokeLinecap="round" /><Ellipse cx="31" cy="70" rx="4" ry="2" fill="#F09C93" opacity={0.7} />
</Svg>; }
const art = StyleSheet.create({ stage: { width: 280, height: 180, overflow: 'hidden', borderRadius: 20 }, light: { position: 'absolute', left: 149, top: 7 }, actor: { position: 'absolute', left: 11, top: 9, width: 96, height: 148 }, helmet: { position: 'absolute', left: 4, top: 0 }, cape: { position: 'absolute', left: 4, top: 48 }, torso: { position: 'absolute', left: 20, top: 70 }, leg: { position: 'absolute', top: 109, width: 24, height: 43 }, arm: { position: 'absolute', top: 79, width: 24, height: 47 }, door: { position: 'absolute', left: 184, top: 16, width: 68, height: 138, backfaceVisibility: 'hidden' }, jamb: { position: 'absolute', left: 251, top: 10, width: 27, height: 151 } });
