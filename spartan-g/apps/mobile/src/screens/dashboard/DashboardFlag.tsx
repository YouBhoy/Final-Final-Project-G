import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { FLAG_CLOTH_SECTIONS, FLAG_SIZE, FLAG_WAVE_DURATION, FLAG_WAVE_INPUT } from './flag-wave';

const hidden = { pointerEvents: 'none' as const, accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
const fabric = 'M13 13Q26 11 35 19T60 20L48 47Q33 52 25 43T13 40Z';
const emblem = 'M34 25Q41 30 34 35Q39 32 42 31Q43 41 32 44Q37 38 31 35Q26 31 32 25Q29 32 34 32Q38 30 34 25Z';

function Cloth({ id }: { id: string }) {
  return <>
    <Defs><LinearGradient id={id} x2="1" y2="0"><Stop stopColor="#A90726" /><Stop offset="0.5" stopColor="#FE3B4C" /><Stop offset="1" stopColor="#BF0024" /></LinearGradient></Defs>
    <Path d={fabric} fill={`url(#${id})`} stroke="#FFF4CB" strokeWidth="1.1" />
    <Path d={emblem} fill="#FFF6DC" />
  </>;
}

/** The pole never moves. A single native clock translates narrow fabric sections. */
export function SpartanFlag({ waving = false }: { waving?: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;
  const sections = useMemo(() => FLAG_CLOTH_SECTIONS.map(section => ({ ...section,
    translateY: phase.interpolate({ inputRange: FLAG_WAVE_INPUT, outputRange: section.offsets }),
  })), [phase]);

  useEffect(() => {
    phase.setValue(0);
    if (!waving) return;
    const breeze = Animated.loop(Animated.timing(phase, {
      toValue: 1, duration: FLAG_WAVE_DURATION, easing: Easing.linear,
      useNativeDriver: true, isInteraction: false,
    }));
    breeze.start();
    return () => { breeze.stop(); phase.stopAnimation(); phase.setValue(0); };
  }, [waving, phase]);

  return <View {...hidden} testID="journey-spartan-flag" style={styles.flag}>
    <Svg testID="journey-stationary-flagpole" {...hidden} width="66" height="87" viewBox="0 0 63 83" style={StyleSheet.absoluteFillObject}>
      <Path d="M11 12V78" stroke="#78351D" strokeWidth="4" strokeLinecap="round" /><Path d="M10 12V77" stroke="#FFE5A0" strokeWidth="1" />
      {!waving && <Cloth id="dashFlagStatic" />}
      <Circle cx="11" cy="9" r="3.5" fill="#A64D27" stroke="#FFE1A4" strokeWidth="1.3" />
    </Svg>
    {waving && sections.map((section, index) => <View key={index} testID={`journey-flag-section-${index}`} style={[styles.section, { left: section.left, width: section.width }]}>
      <Animated.View testID={`journey-flag-fabric-${index}`} style={[styles.fabric, { left: -section.left, transform: [{ translateY: section.translateY }] }]}>
        <Svg {...hidden} width="66" height="87" viewBox="0 0 63 83"><Cloth id={`dashFlagCloth${index}`} /></Svg>
      </Animated.View>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  flag: { ...FLAG_SIZE },
  section: { position: 'absolute', top: 0, height: FLAG_SIZE.height, overflow: 'hidden' },
  fabric: { position: 'absolute', top: 0, ...FLAG_SIZE },
});
