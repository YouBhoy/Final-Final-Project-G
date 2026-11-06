import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle, type StyleProp } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CheckpointPlatform, CrimsonButtonSurface, JourneyCardColor, JourneyLandscape, JourneyPath, SpartanFlag } from './DashboardArtwork';
import type { JourneyPhase } from './dashboard-model';
import type { useDashboardMotion } from './dashboard-motion';

export const dashboardColors = { cream: '#FFFAF5', ink: '#141426', muted: '#716862', red: '#D8002A', crimson: '#A90025' };
export type DashboardMotion = ReturnType<typeof useDashboardMotion>;

export function DashboardButton({ children, onPress, label, hint, motion, disabled, style, testID }: {
  children: ReactNode; onPress: () => void; label: string; hint?: string; motion: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => { if (!motion || disabled) { animation.current?.stop(); scale.setValue(1); } return () => animation.current?.stop(); }, [motion, disabled, scale]);
  const press = (toValue: number) => {
    animation.current?.stop();
    if (!motion || disabled) { scale.setValue(1); return; }
    animation.current = Animated.timing(scale, { toValue, duration: 110, useNativeDriver: true });
    animation.current.start();
  };
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} onPressIn={() => press(0.98)} onPressOut={() => press(1)} android_ripple={{ color: '#FFFFFF30' }} style={[style, disabled && { opacity: 0.65 }]}>{children}</Pressable></Animated.View>;
}

export function Entrance({ children, progress, style }: { children: ReactNode; progress: Animated.Value; style?: StyleProp<ViewStyle> }) {
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>;
}

export function AssessmentJourney({ inProgress, completed, phase, onPress, loading, motion, largeText }: {
  inProgress: number | null; completed: number | null; phase: JourneyPhase | null; onPress: () => void; loading: boolean; motion: DashboardMotion; largeText: boolean;
}) {
  const { width } = useWindowDimensions();
  const idleWidth = width < 360 ? 54 : 62;
  const activeWidth = width < 360 ? 66 : 78;
  const stateFade = useRef(new Animated.Value(1)).current;
  const previousPhase = useRef(phase);
  useEffect(() => {
    if (!phase) return;
    const changed = previousPhase.current !== null && previousPhase.current !== phase;
    previousPhase.current = phase;
    if (!changed || !motion.allowed) { stateFade.setValue(1); return; }
    stateFade.setValue(0.65);
    const transition = Animated.timing(stateFade, { toValue: 1, duration: 280, useNativeDriver: true });
    transition.start(); return () => { transition.stop(); stateFade.setValue(1); };
  }, [phase, motion.allowed, stateFade]);
  const stages = [
    { label: 'Start', active: phase === 'start', checked: phase === 'in_progress' || phase === 'complete', icon: 'circle' as const },
    { label: 'In progress', active: phase === 'in_progress', checked: phase === 'complete', icon: 'clock' as const },
    { label: 'Finish', active: phase === 'complete', checked: phase === 'complete', icon: 'lock' as const },
  ];
  const action = phase === 'in_progress' ? 'Continue assessment' : phase === 'complete' ? 'View assessments' : 'Start assessment';
  return <View testID="dashboard-assessment-journey" style={styles.card}>
    <JourneyCardColor />
    <View pointerEvents="none" style={styles.landscape}><JourneyLandscape /></View>
    <Text accessibilityRole="header" style={styles.journeyTitle}>Your assessment journey</Text>
    <View style={[styles.stats, width >= 360 && !largeText && styles.statsInset, largeText && styles.statsStack]}>
      <View style={[styles.stat, styles.pendingStat]}><View style={styles.progressRing} /><Text testID="dashboard-progress-count" style={styles.statText}>{inProgress === null ? '—' : inProgress} in progress</Text></View>
      <View style={[styles.stat, largeText && styles.statHighContrast]}><View style={styles.completeSeal}><Feather name="check" size={16} color="#BB4955" /></View><Text testID="dashboard-completed-count" style={styles.statText}>{completed === null ? '—' : completed} completed</Text></View>
    </View>
    <Animated.View testID="dashboard-journey-stages" accessibilityLabel={phase === null ? 'Assessment progress has not been confirmed' : phase === 'in_progress' ? 'Started; in progress; finish not yet reached' : phase === 'complete' ? 'A submitted or graded assessment is confirmed complete' : 'Ready to start; no completed assessment confirmed'} style={[styles.scene, { opacity: stateFade }]}>
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFillObject}><JourneyPath /></View>
      {phase === 'in_progress' && <Animated.View testID="journey-path-highlight" pointerEvents="none" style={[styles.pathLight, { opacity: motion.ambient.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] }), transform: [{ translateX: motion.ambient.interpolate({ inputRange: [0, 1], outputRange: [0, 57] }) }] }]} />}
      <View style={styles.checkpoints}>{stages.map((stage, index) => <View key={stage.label} style={[styles.checkpoint, stage.active && styles.currentCheckpoint]}>
        <View style={[styles.platform, { width: stage.active ? activeWidth : idleWidth, height: (stage.active ? activeWidth : idleWidth) * 40 / 78 }]}>
          {stage.active && <Animated.View pointerEvents="none" style={[styles.halo, { opacity: motion.ambient.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] }) }]} />}
          <CheckpointPlatform active={stage.active} />
          {stage.active ? <View testID={`journey-active-${index}`} pointerEvents="none" style={[styles.flag, { left: activeWidth / 2 - 11.5 }]}><SpartanFlag waving={motion.allowed} /></View> : <View pointerEvents="none" style={styles.stageIcon}><Feather name={stage.checked ? 'check' : stage.icon} size={22} color={phase === null ? '#9B8273' : '#655950'} /></View>}
        </View>
        <Text style={[styles.stageLabel, stage.active && styles.activeLabel]}>{stage.label}</Text>
      </View>)}</View>
    </Animated.View>
    <View style={styles.actionWrap}><DashboardButton testID="dashboard-continue-assessment" label={phase ? action : loading ? 'Loading assessment progress' : 'Open assessments'} hint={phase === 'in_progress' ? 'Resumes your most recently edited in-progress assessment. Find all assessments in the Assessments tab.' : undefined} motion={motion.allowed} disabled={loading && !phase} onPress={onPress} style={styles.action}>
      <CrimsonButtonSurface />
      <Text style={styles.actionText}>{phase ? action : loading ? 'Loading your journey…' : 'Open assessments'}</Text><Feather name="arrow-right" size={25} color="#FFFFFF" />
    </DashboardButton></View>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: '#FFA49D', backgroundColor: '#CC1031', elevation: 4, shadowColor: '#A03C36', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 16 },
  landscape: { ...StyleSheet.absoluteFillObject },
  journeyTitle: { color: '#FFFFFF', fontFamily: 'sans-serif', fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.9, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 12 },
  stats: { flexDirection: 'row', gap: 9, paddingHorizontal: 18, paddingBottom: 3 }, statsStack: { flexDirection: 'column', alignItems: 'flex-start' },
  statsInset: { paddingRight: 48 },
  stat: { flex: 1, minWidth: 0, minHeight: 38, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 26, backgroundColor: '#FFFFFF33', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statHighContrast: { backgroundColor: '#B80E35C7' }, completeSeal: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFE1DBC9' },
  pendingStat: { backgroundColor: '#F42D499E', borderWidth: 1, borderColor: '#FF819099' }, statText: { color: '#FFFFFF', fontFamily: 'sans-serif', fontSize: 15, lineHeight: 21, flexShrink: 1 },
  progressRing: { width: 21, height: 21, borderRadius: 11, borderWidth: 5, borderColor: '#FF9DAB', borderTopColor: '#FFFFFF', borderRightColor: '#FFFFFF' },
  scene: { height: 170, marginTop: 0 }, checkpoints: { flexDirection: 'row', alignItems: 'flex-end', position: 'absolute', left: 10, right: 10, bottom: 10, gap: 4 }, checkpoint: { flex: 1, minWidth: 0, alignItems: 'center' }, currentCheckpoint: { transform: [{ translateY: -5 }] },
  platform: { width: 78, height: 40 }, stageIcon: { position: 'absolute', top: 0, left: 0, right: 0, height: 24, alignItems: 'center', justifyContent: 'center' }, flag: { position: 'absolute', bottom: 18, left: 25 },
  halo: { position: 'absolute', left: -9, top: -6, width: 96, height: 45, borderRadius: 48, borderWidth: 2, borderColor: '#FFF4A9', backgroundColor: '#FFF0A530' },
  stageLabel: { fontFamily: 'sans-serif', fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center', color: '#271515', marginTop: 3 }, activeLabel: { color: '#A50926', fontWeight: '800' },
  pathLight: { position: 'absolute', left: '20%', bottom: 59, width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFE2', shadowColor: '#FFF8A8', shadowOpacity: 1, shadowRadius: 7 },
  actionWrap: { paddingHorizontal: 11, paddingBottom: 12 }, action: { minHeight: 56, borderRadius: 32, overflow: 'hidden', backgroundColor: '#C8002CF5', borderWidth: 1.5, borderColor: '#FF6C7D', paddingHorizontal: 18, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }, actionText: { color: '#FFFFFF', fontFamily: 'sans-serif', fontSize: 18, lineHeight: 24, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
});
