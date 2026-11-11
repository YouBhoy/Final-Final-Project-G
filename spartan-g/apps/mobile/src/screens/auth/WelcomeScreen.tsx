import { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { useAuthStore } from '@spartan-g/shared-services';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { WelcomeArtwork } from './WelcomeArtwork';
import { useWelcomeMotion } from './welcome-motion';

type Props = NativeStackScreenProps<MobileAuthStackParamList, 'Welcome'>;
const approvedSpartan = require('../../../assets/chibi wave red spartan cartoon.png');

/** Public introduction only. Login, consent and protected navigation are unchanged. */
export function WelcomeScreen({ navigation }: Props) {
  const { width, height, fontScale = 1 } = useWindowDimensions();
  const insets = useSafeAreaInsets(), motion = useWelcomeMotion();
  const mounted = useRef(true), leaving = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const availableHeight = Math.max(0, height - insets.top - insets.bottom);
  const contentWidth = Math.min(480, Math.max(0, width - insets.left - insets.right));
  const compact = availableHeight < 650;
  const largeText = fontScale > 1.25;
  const heroHeight = Math.round(Math.min(largeText ? 215 : compact ? 230 : 310, Math.max(185, contentWidth * 0.79)));
  // Keep the university/app names whole on compact screens. Body copy continues
  // to use the full system scale and the complete page remains scrollable.
  const headingSize = Math.min(width < 360 ? 31 : 35, Math.max(18, (contentWidth - (compact ? 40 : 48)) / (6.5 * Math.max(1, fontScale))));
  const characterHeight = heroHeight * 0.88;
  function start() {
    const state = useAuthStore.getState();
    if (!mounted.current || leaving.current || !motion.focused || (state.status === 'authenticated' && state.session)) return;
    leaving.current = true;
    try { navigation.replace('Login'); } catch { leaving.current = false; }
  }
  return <SafeAreaView testID="spartan-welcome" edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
    {motion.focused && <StatusBar style="dark" />}
    <ScrollView testID="welcome-scroll" style={styles.scroll} contentContainerStyle={[styles.scrollContent, { minHeight: availableHeight }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={[styles.content, compact && styles.compactContent]}>
        <View testID="welcome-brand" style={[styles.brandRow, largeText && styles.brandStack]}>
          <View style={styles.brandMark} accessible={false}><Image source={require('../../../assets/icon.png')} accessible={false} resizeMode="contain" style={{ width: 34, height: 34 }} /></View>
          <View style={[styles.brandCopy, largeText && styles.brandCopyStack]}><Text style={[styles.wordmark, largeText && styles.wordmarkStack]}>SPARTAN-G</Text><Text style={[styles.university, largeText && styles.centered]}>BATANGAS STATE UNIVERSITY</Text><Text style={[styles.identity, largeText && styles.centered]}>The National Engineering University</Text></View>
        </View>
        <View testID="welcome-hero" style={[styles.hero, { height: heroHeight }]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View pointerEvents="none" style={StyleSheet.absoluteFillObject}><WelcomeArtwork /></View>
          <Animated.View pointerEvents="none" style={[styles.mascotFrame, { width: characterHeight * 5 / 6, height: characterHeight, opacity: motion.entrance.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }), transform: [{ translateY: motion.entrance.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}>
            <Image testID="welcome-approved-mascot" accessible={false} source={approvedSpartan} resizeMode="contain" resizeMethod="resize" fadeDuration={0} style={styles.mascot} />
          </Animated.View>
        </View>
        <Animated.View style={[styles.copy, { opacity: motion.entrance.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }]}>
          <Text testID="welcome-heading" accessibilityRole="header" style={[styles.heading, { fontSize: headingSize, lineHeight: headingSize * 1.2 }]}>Welcome to{'\n'}<Text style={styles.headingAccent}>SPARTAN-G</Text></Text>
          <Text testID="welcome-tagline" style={styles.tagline}>Your journey toward growth begins here.</Text>
          <Text style={styles.description}>Explore assessments, stay connected, and celebrate every milestone.</Text>
        </Animated.View>
        <View style={styles.actions}>
          <Animated.View style={{ width: '100%', transform: [{ scale: motion.scale }] }}>
            <Pressable testID="welcome-get-started" accessibilityRole="button" accessibilityLabel="Get Started" accessibilityHint="Opens the Spartan-G sign-in screen" onPress={start} onPressIn={() => motion.press(0.98)} onPressOut={() => motion.press(1)} android_ripple={{ color: '#FFFFFF22' }} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={styles.buttonText}>Get Started</Text><Feather name="arrow-right" size={22} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
          <Text testID="welcome-footer" style={styles.footer}>A Batangas State University Student Experience</Text>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFAF4' }, scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  content: { width: '100%', maxWidth: 480, flexGrow: 1, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18, justifyContent: 'space-between', gap: 12 },
  compactContent: { paddingTop: 14, paddingHorizontal: 20, gap: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandStack: { flexDirection: 'column', gap: 8 }, brandCopyStack: { flex: 0, width: '100%' }, centered: { textAlign: 'center' },
  brandMark: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#FBE3DC', borderWidth: 1, borderColor: '#F3C9C1', alignItems: 'center', justifyContent: 'center' },
  brandCopy: { flex: 1, minWidth: 0 }, wordmark: { fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: 1.3, color: '#AD1937' },
  wordmarkStack: { fontSize: 20, textAlign: 'center', letterSpacing: 0.5 },
  university: { fontSize: 9, lineHeight: 15, letterSpacing: 0.9, fontWeight: '700', color: '#74565B' }, identity: { fontSize: 10, lineHeight: 15, color: '#806A69' },
  hero: { width: '100%', maxWidth: 410, alignSelf: 'center', justifyContent: 'center', alignItems: 'center' },
  mascotFrame: { position: 'absolute', bottom: '5%', alignSelf: 'center' }, mascot: { width: '100%', height: '100%' },
  copy: { alignItems: 'center', gap: 12 },
  heading: { width: '100%', fontSize: 35, lineHeight: 42, fontWeight: '800', letterSpacing: -1.2, color: '#36222C', textAlign: 'center' },
  headingAccent: { color: '#B41838' },
  tagline: { color: '#713B49', fontSize: 17, lineHeight: 25, fontWeight: '600', textAlign: 'center' },
  description: { maxWidth: 330, fontSize: 14, lineHeight: 22, color: '#756168', textAlign: 'center' },
  actions: { gap: 15, alignItems: 'center', paddingTop: 6 },
  button: { width: '100%', minHeight: 58, paddingHorizontal: 22, paddingVertical: 16, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#B71939', borderWidth: 1, borderColor: '#A41130', elevation: 3, shadowColor: '#94142E', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.15, shadowRadius: 10, overflow: 'hidden' },
  buttonPressed: { backgroundColor: '#99132F' }, buttonText: { fontSize: 17, lineHeight: 24, fontWeight: '700', color: '#FFFFFF', flexShrink: 1, textAlign: 'center' },
  footer: { fontSize: 11, lineHeight: 18, textAlign: 'center', color: '#79656C', paddingHorizontal: 12 },
});
