import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, BackHandler, Easing, Keyboard, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors, palette } from '@spartan-g/shared-ui';
import { useExpandableNavigation } from './ExpandableNavigationContext';
import { ACTION_HEIGHT, NAVIGATION_DESTINATIONS, NAVIGATION_ROW_HEIGHT, STUDENT_DOCK_LIFT, navigationButtonCenter, expandedNavigationLayout, navigationBarHeight, type NavigationDestination, type NavigationPortal } from './expandable-navigation';

export function ExpandableTabBar({ state, descriptors, navigation, insets, portal }: BottomTabBarProps & { portal: NavigationPortal }) {
  const { width, height } = useWindowDimensions();
  const parentNavigation = useNavigation();
  const { setExpanded } = useExpandableNavigation();
  const session = useAuthStore(s => s.session);
  const status = useAuthStore(s => s.status);
  const owner = status === 'authenticated' && session?.role === portal ? `${portal}:${session.uid}` : null;
  const [visible, setVisible] = useState(false);
  const [menuOwner, setMenuOwner] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  // Do not animate until the platform's reduced-motion preference has been read.
  const [reducedMotion, setReducedMotion] = useState(true);
  const [frame, setFrame] = useState<{ width: number; height: number } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const busy = useRef(false);
  const menuVisible = useRef(false);
  const wantsOpen = useRef(false);
  const closing = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const config = NAVIGATION_DESTINATIONS[portal];
  const barHeight = navigationBarHeight(insets.bottom);
  const layout = expandedNavigationLayout(portal, frame?.width ?? width, frame?.height ?? height, insets);
  const compactCanvasHeight = Math.max(layout.canvasHeight, (frame?.height ?? height) - insets.top - 8 - barHeight);
  const active = state.routes[state.index]?.name;
  const selectedExtra = config.expanded.find(item => item.route === active);
  const isOpen = visible && owner !== null && menuOwner === owner && !keyboardVisible;

  const closeImmediately = useCallback(() => {
    generation.current++; animation.current?.stop(); animation.current = null;
    busy.current = false; menuVisible.current = false; wantsOpen.current = false; closing.current = false; progress.setValue(0);
    if (mounted.current) { setVisible(false); setAnimating(false); setMenuOwner(null); }
    setExpanded(false);
  }, [progress, setExpanded]);

  const transition = useCallback((open: boolean, after?: () => void) => {
    closing.current = !open;
    if (!open) wantsOpen.current = false;
    const run = ++generation.current;
    animation.current?.stop();
    busy.current = true; setAnimating(true);
    const finish = () => {
      if (!mounted.current || generation.current !== run) return;
      animation.current = null; busy.current = false; setAnimating(false);
      if (!open) { menuVisible.current = false; setVisible(false); setMenuOwner(null); setExpanded(false); }
      after?.();
    };
    if (reducedMotion) { progress.setValue(open ? 1 : 0); finish(); return; }
    animation.current = Animated.timing(progress, { toValue: open ? 1 : 0, duration: 240, easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true });
    animation.current.start(({ finished }) => { if (finished) finish(); });
  }, [progress, reducedMotion, setExpanded]);

  const dismiss = useCallback(() => {
    if (menuVisible.current && !closing.current) transition(false);
  }, [transition]);

  // Start after the same-window touch surface is committed, without a second Modal window.
  useEffect(() => {
    if (isOpen && menuVisible.current && wantsOpen.current) {
      wantsOpen.current = false;
      transition(true);
    }
  }, [isOpen, transition]);

  useEffect(() => {
    if (!isOpen) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!menuVisible.current) return false;
      dismiss();
      return true;
    });
    return () => back.remove();
  }, [isOpen, dismiss]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (!cancelled) setReducedMotion(value); }).catch(() => { /* Conservative no-motion default. */ });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const show = Keyboard.addListener('keyboardDidShow', () => { setKeyboardVisible(true); closeImmediately(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    const background = AppState.addEventListener('change', value => { if (value !== 'active') closeImmediately(); });
    return () => {
      cancelled = true; mounted.current = false; generation.current++; animation.current?.stop();
      motion.remove(); show.remove(); hide.remove(); background.remove(); setExpanded(false);
    };
  }, [closeImmediately, setExpanded]);

  useEffect(() => { closeImmediately(); }, [owner, state.key, state.index, width, height, closeImmediately]);
  useEffect(() => {
    const stopState = parentNavigation.addListener('state', closeImmediately);
    const stopBlur = parentNavigation.addListener('blur', closeImmediately);
    return () => { stopState(); stopBlur(); };
  }, [parentNavigation, closeImmediately]);

  function authorized() {
    const auth = useAuthStore.getState();
    return !!owner && auth.status === 'authenticated' && auth.session?.role === portal && `${portal}:${auth.session.uid}` === owner;
  }
  function toggle() {
    if (busy.current || !authorized()) return;
    if (menuVisible.current) { transition(false); return; }
    Keyboard.dismiss(); progress.setValue(0); menuVisible.current = true; wantsOpen.current = true; busy.current = true;
    setAnimating(true); setMenuOwner(owner); setVisible(true); setExpanded(true);
    // The commit effect starts the animation after the popup becomes visible.
  }
  function select(destination: NavigationDestination) {
    if (busy.current || !authorized()) return;
    const route = state.routes.find(item => item.name === destination.route);
    if (!route) return;
    const navigate = () => {
      if (!authorized()) return;
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!event.defaultPrevented && route.name !== active) navigation.navigate(route.name, route.params);
    };
    if (menuVisible.current) transition(false, navigate); else navigate();
  }

  function bar() {
    const student = portal === 'student';
    const dockWidth = frame?.width ?? width;
    const center = layout.originX;
    const dockHeight = barHeight + STUDENT_DOCK_LIFT;
    const outline = `M 0 54 Q 0 22 34 22 H ${center-58} C ${center-38} 22 ${center-40} 0 ${center} 0 C ${center+40} 0 ${center+38} 22 ${center+58} 22 H ${dockWidth-34} Q ${dockWidth} 22 ${dockWidth} 54 V ${dockHeight} H 0 Z`;
    return <View testID="navigation-bar" pointerEvents="box-none" style={[styles.bar, { height: student ? dockHeight : barHeight, paddingBottom: layout.bottomPadding, paddingLeft: insets.left, paddingRight: insets.right }, student && styles.studentDock]}>
      {student && <Svg testID="student-dock-surface" width="100%" height={dockHeight} viewBox={`0 0 ${dockWidth} ${dockHeight}`} style={StyleSheet.absoluteFillObject} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
        <Path d={outline} fill="#613344" opacity={0.055} transform="translate(0 -2)" /><Path d={outline} fill={palette.white} />
      </Svg>}
      <View testID="navigation-control-row" collapsable={false} pointerEvents="box-none" style={[styles.row, student && styles.studentRow]}>
        {config.primary.map((item, index) => item ? <Pressable key={item.route} testID={`nav-${item.route}`} accessibilityRole="tab" accessibilityLabel={descriptors[state.routes.find(route => route.name === item.route)?.key ?? '']?.options.tabBarAccessibilityLabel ?? item.label} accessibilityState={{ selected: item.route === active }} onPress={() => select(item)} android_ripple={student ? { color: '#FCE2E6', borderless: true } : undefined} onLongPress={() => { if (!authorized() || busy.current) return; const route = state.routes.find(row => row.name === item.route); if (route) navigation.emit({ type: 'tabLongPress', target: route.key }); }} style={[styles.primary, student && styles.studentPrimary]}>
          {student && item.route === 'StudentHome' && item.route === active ? <Svg width={25} height={25} viewBox="0 0 24 24" accessible={false}><Path d="M3 10L12 2L21 10V21H15V14H9V21H3Z" fill={lightColors.primary} stroke={lightColors.primary} strokeWidth={1.5} strokeLinejoin="round" /></Svg> : <Feather name={item.icon} size={student ? 25 : 23} color={item.route === active ? lightColors.primary : lightColors.textMuted} />}
          <Text numberOfLines={student ? 1 : 2} maxFontSizeMultiplier={student ? 1.1 : 1.3} adjustsFontSizeToFit={student} minimumFontScale={0.8} style={[styles.primaryLabel, student && styles.studentPrimaryLabel, item.route === active && styles.selectedLabel]}>{item.label}</Text>
          {item.route === active && <View style={styles.selectedDot} />}
        </Pressable> : <View key={`more-${index}`} pointerEvents="box-none" style={[styles.plusCell, student && styles.studentPlusCell]}>
          {/* Keep the native shadow outside the clipped ripple surface. The
              non-flattened control row stays above the decorative dock SVG. */}
          <View testID="navigation-more-shadow" collapsable={false} style={[styles.plus, student && styles.studentPlus, selectedExtra && styles.plusSelected]}>
            <Pressable testID="navigation-more" accessibilityRole="button" accessibilityLabel={isOpen ? 'Close more destinations' : `More destinations${selectedExtra ? `, ${selectedExtra.label} selected` : ''}`} accessibilityHint="Opens additional navigation buttons" accessibilityState={{ expanded: isOpen, selected: !!selectedExtra, disabled: animating }} onPress={toggle} android_ripple={{ color: '#FFFFFF45', borderless: false }} style={({ pressed }) => [styles.plusSurface, student && styles.studentPlusSurface, selectedExtra && styles.plusSelected, pressed && styles.plusPressed]}>
              <Animated.View pointerEvents="none" style={{ transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
                <View testID="navigation-more-plus" accessible={false} style={styles.plusGlyph}>
                  <View testID="navigation-more-plus-horizontal" style={styles.plusHorizontal} />
                  <View testID="navigation-more-plus-vertical" style={styles.plusVertical} />
                </View>
              </Animated.View>
            </Pressable>
          </View>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.moreLabel, student && styles.studentMoreLabel, selectedExtra && styles.selectedLabel]}>More</Text>
        </View>)}
      </View>
    </View>;
  }

  function actions(compact: boolean) {
    const originY = compact ? compactCanvasHeight + navigationButtonCenter(portal) : layout.originY;
    return config.expanded.map((item, index) => {
      const offset = layout.positions[index], selected = item.route === active;
      return <Animated.View key={item.route} testID={`action-position-${item.route}`} pointerEvents={animating ? 'none' : 'auto'} style={[styles.actionPosition, { left: layout.originX - layout.actionWidth / 2, top: originY - ACTION_HEIGHT / 2, width: layout.actionWidth, opacity: progress, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, offset.x] }) }, { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, offset.y] }) }, { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }] }]}>
        <Pressable testID={`nav-${item.route}`} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected, disabled: animating }} disabled={animating} onPress={() => select(item)} style={styles.actionTarget}>
          <View style={[styles.actionCircle, selected && styles.actionSelected]}><Feather name={item.icon} size={22} color={lightColors.primary} /></View>
          <View testID={`nav-label-pill-${item.route}`} style={styles.labelPill}>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.3} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.actionLabel, selected && styles.actionLabelSelected]}>{item.label}</Text>
          </View>
        </Pressable>
      </Animated.View>;
    });
  }

  function popup(compact: boolean) {
    const originY = compact ? compactCanvasHeight + navigationButtonCenter(portal) : layout.originY;
    const xs = layout.positions.map(position => position.x);
    const ys = layout.positions.map(position => position.y);
    const availableWidth = (frame?.width ?? width) - insets.left - insets.right;
    const popupWidth = Math.max(0, Math.min(availableWidth - 16, Math.max(...xs) - Math.min(...xs) + layout.actionWidth + 24));
    const top = originY + Math.min(...ys) - ACTION_HEIGHT / 2 - 8;
    // Frame only the actions; leave a gap above the permanent bar. In compact
    // windows the shape shares the actions' scroll canvas and cannot drift away.
    const bottom = Math.min(originY + Math.max(...ys) + ACTION_HEIGHT / 2 + 8, originY - 32);
    const popupHeight = bottom - top;
    const radius = Math.min(popupWidth, popupHeight) / 2;
    const gradientId = `spartan-navigation-${portal}-red`;
    const sheenId = `spartan-navigation-${portal}-sheen`;
    return <>
      <Animated.View testID="navigation-popup-background" pointerEvents="none" accessible={false} importantForAccessibility="no" needsOffscreenAlphaCompositing style={[styles.popupBackground, {
        left: layout.originX - popupWidth / 2,
        top,
        width: popupWidth,
        height: popupHeight,
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.26] }),
        transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
      }]}>
        {/* Existing SVG support provides a static, brand-colour glass surface.
            Only its parent's opacity/scale animate; no blur or per-frame JS. */}
        <Svg width="100%" height="100%" viewBox={`0 0 ${popupWidth} ${popupHeight}`} accessible={false} pointerEvents="none">
          <Defs>
            <LinearGradient id={gradientId} x1="8%" y1="0%" x2="88%" y2="100%">
              <Stop offset="0%" stopColor={palette.spartanRed} />
              <Stop offset="48%" stopColor={palette.spartanRed} />
              <Stop offset="100%" stopColor={palette.spartanRedDark} />
            </LinearGradient>
            <RadialGradient id={sheenId} cx="28%" cy="8%" rx="72%" ry="85%">
              <Stop offset="0%" stopColor={palette.white} stopOpacity={0.38} />
              <Stop offset="60%" stopColor={palette.white} stopOpacity={0.10} />
              <Stop offset="100%" stopColor={palette.white} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={popupWidth} height={popupHeight} rx={radius} ry={radius} fill={`url(#${gradientId})`} />
          <Rect width={popupWidth} height={popupHeight} rx={radius} ry={radius} fill={`url(#${sheenId})`} />
          <Rect x={0.75} y={0.75} width={Math.max(0, popupWidth - 1.5)} height={Math.max(0, popupHeight - 1.5)} rx={Math.max(0, radius - 0.75)} ry={Math.max(0, radius - 0.75)} fill="none" stroke={palette.white} strokeOpacity={0.58} strokeWidth={1} />
          <Path d={`M ${popupWidth * 0.17} ${popupHeight * 0.14} Q ${popupWidth * 0.40} ${popupHeight * 0.015} ${popupWidth * 0.66} ${popupHeight * 0.11}`} fill="none" stroke={palette.white} strokeOpacity={0.32} strokeWidth={1.2} strokeLinecap="round" />
        </Svg>
      </Animated.View>
      {actions(compact)}
    </>;
  }

  if (!owner || keyboardVisible) return null;
  return <>
    {/* BottomTabView places these siblings in its full-size native container. The
        transparent spacer reserves screen space; it contains no navigation UI. */}
    <View testID="navigation-space" pointerEvents="none" importantForAccessibility="no" style={{ height: barHeight }} />
    <View testID="navigation-layer" collapsable={false} pointerEvents="box-none" style={styles.layer} accessibilityViewIsModal={isOpen} onAccessibilityEscape={dismiss} onLayout={event => {
      const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
      if (nextWidth > 0 && nextHeight > 0) setFrame(previous => previous?.width === nextWidth && previous.height === nextHeight ? previous : { width: nextWidth, height: nextHeight });
    }}>
      {isOpen && <>
        <Animated.View testID="navigation-dim" style={[styles.backdrop, { bottom: barHeight, opacity: progress }]}>
          <Pressable testID="navigation-backdrop" accessibilityRole="button" accessibilityLabel="Close more destinations" onPress={dismiss} style={StyleSheet.absoluteFillObject} />
        </Animated.View>
        {layout.compact ? <ScrollView testID="compact-navigation-actions" style={{ position: 'absolute', top: insets.top + 8, bottom: barHeight, left: 0, right: 0 }} contentContainerStyle={{ height: compactCanvasHeight }} keyboardShouldPersistTaps="handled"><View style={{ height: compactCanvasHeight }}><Pressable testID="compact-navigation-backdrop" accessibilityRole="button" accessibilityLabel="Close more destinations" onPress={dismiss} style={StyleSheet.absoluteFillObject} />{popup(true)}</View></ScrollView> : <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>{popup(false)}</View>}
      </>}
      {bar()}
    </View>
  </>;
}

const styles = StyleSheet.create({
  studentDock: { backgroundColor: 'transparent', borderTopWidth: 0 },
  studentRow: { height: NAVIGATION_ROW_HEIGHT + STUDENT_DOCK_LIFT, paddingHorizontal: 7, alignItems: 'flex-start' },
  studentPrimary: { height: NAVIGATION_ROW_HEIGHT, marginTop: STUDENT_DOCK_LIFT },
  studentPrimaryLabel: { fontSize: 11, lineHeight: 15 },
  studentPlusCell: { height: NAVIGATION_ROW_HEIGHT + STUDENT_DOCK_LIFT },
  studentPlus: { top: 6, width: 64, height: 64, borderRadius: 32, elevation: 6, shadowOpacity: 0.18, shadowRadius: 8 },
  studentPlusSurface: { borderRadius: 32, borderWidth: 3, borderColor: palette.white },
  studentMoreLabel: { top: 77, color: palette.spartanRed, fontSize: 12, fontWeight: '600' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: lightColors.surface, borderTopColor: lightColors.border, borderTopWidth: StyleSheet.hairlineWidth },
  row: { position: 'relative', zIndex: 1, height: NAVIGATION_ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 },
  primary: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 1, paddingBottom: 6 },
  primaryLabel: { fontSize: 11, lineHeight: 15, color: lightColors.textMuted, textAlign: 'center', maxWidth: '100%' },
  selectedLabel: { color: lightColors.primary, fontWeight: '700' },
  selectedDot: { position: 'absolute', bottom: 1, width: 4, height: 4, borderRadius: 2, backgroundColor: lightColors.primary },
  plusCell: { flex: 1, height: NAVIGATION_ROW_HEIGHT, alignItems: 'center' },
  plus: { position: 'absolute', zIndex: 1, top: 0, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.spartanRed, elevation: 5, shadowColor: palette.black, shadowOpacity: 0.15, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  plusSurface: { width: '100%', height: '100%', borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: palette.spartanRed },
  plusPressed: { opacity: 0.86 },
  plusGlyph: { width: 28, height: 28 },
  plusHorizontal: { position: 'absolute', left: 3, top: 12, width: 22, height: 4, borderRadius: 2, backgroundColor: palette.white },
  plusVertical: { position: 'absolute', left: 12, top: 3, width: 4, height: 22, borderRadius: 2, backgroundColor: palette.white },
  plusSelected: { backgroundColor: palette.spartanRedDark },
  moreLabel: { position: 'absolute', top: 57, left: 0, right: 0, fontSize: 11, lineHeight: 14, textAlign: 'center', color: lightColors.textMuted },
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.12)' },
  popupBackground: { position: 'absolute', borderRadius: 999, backgroundColor: palette.spartanRed, shadowColor: palette.spartanRedDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
  actionPosition: { position: 'absolute', height: ACTION_HEIGHT },
  actionTarget: { width: '100%', height: ACTION_HEIGHT, alignItems: 'center', paddingTop: 0 },
  actionCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.22)', elevation: 3, shadowColor: palette.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 5 },
  actionSelected: { borderColor: lightColors.primary },
  labelPill: { alignSelf: 'center', maxWidth: '100%', marginTop: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.95)', elevation: 2, shadowColor: palette.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  actionLabel: { fontSize: 12, lineHeight: 14, fontWeight: '600', textAlign: 'center', color: palette.spartanRedDark },
  actionLabelSelected: { fontWeight: '700' },
});
