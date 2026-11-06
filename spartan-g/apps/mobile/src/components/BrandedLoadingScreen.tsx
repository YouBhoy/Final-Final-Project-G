import { useEffect, useRef, type ReactNode } from 'react';
import { View, Text, Image, Animated, Easing, StyleSheet, AppState, useWindowDimensions } from 'react-native';
import { palette } from '@spartan-g/shared-ui';

// The existing RootNavigator loader, shared without changing its artwork or animation.
export function BrandedLoadingScreen({ children }: { children?: ReactNode }) {
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  const fillWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(fillWidth, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(fillWidth, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
      { iterations: -1 },
    );
    if (AppState.currentState === 'active') animation.start();
    const state = AppState.addEventListener('change', next => {
      animation.stop();
      if (next === 'active') { animation.reset(); animation.start(); }
    });
    return () => { state.remove(); animation.stop(); };
  }, [fillWidth]);

  const barWidth = fillWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View testID="spartan-branded-loading" accessibilityLabel="Loading Spartan-G" style={styles.loading}>
      {/* Gradient overlay — rich red-to-maroon */}
      <View style={styles.gradientOverlay} />

      {/* Blurred blob 1 — bright red, top-left */}
      <View
        style={[
          styles.blob,
          {
            width: SCREEN_WIDTH * 0.7,
            height: SCREEN_WIDTH * 0.7,
            borderRadius: SCREEN_WIDTH * 0.35,
            top: -SCREEN_WIDTH * 0.15,
            left: -SCREEN_WIDTH * 0.2,
            backgroundColor: 'rgba(220, 38, 38, 0.35)',
          },
        ]}
      />

      {/* Blurred blob 2 — maroon, bottom-right */}
      <View
        style={[
          styles.blob,
          {
            width: SCREEN_WIDTH * 0.6,
            height: SCREEN_WIDTH * 0.6,
            borderRadius: SCREEN_WIDTH * 0.3,
            bottom: -SCREEN_WIDTH * 0.1,
            right: -SCREEN_WIDTH * 0.15,
            backgroundColor: 'rgba(153, 27, 27, 0.4)',
          },
        ]}
      />

      {/* Blurred blob 3 — dark red, center-right */}
      <View
        style={[
          styles.blob,
          {
            width: SCREEN_WIDTH * 0.5,
            height: SCREEN_WIDTH * 0.5,
            borderRadius: SCREEN_WIDTH * 0.25,
            top: SCREEN_HEIGHT * 0.3,
            right: -SCREEN_WIDTH * 0.1,
            backgroundColor: 'rgba(185, 28, 28, 0.3)',
          },
        ]}
      />

      {/* Logo on white circular card */}
      <View style={styles.logoCard}>
        <Image
          source={require('../../assets/Batangas_State_Logo.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </View>

      {/* LOADING text */}
      <Text style={styles.loadingText}>LOADING</Text>

      {/* Animated progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: barWidth }]} />
      </View>
      {children ? <View style={{ width: '100%', maxWidth: 360, paddingHorizontal: 24, gap: 12 }}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.spartanRed,
    gap: 24,
    overflow: 'hidden',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    // Simulates a rich red-to-maroon gradient using layered semi-transparent views
  },
  blob: {
    position: 'absolute',
    opacity: 0.9,
    // blurRadius is applied via the component's shadow or style — we use large
    // soft circles with low opacity instead of actual blur for cross-platform
    // compatibility on React Native (no native blur dependency needed).
  },
  logoCard: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: palette.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    padding: 16,
    zIndex: 10,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 3,
    color: palette.white,
    zIndex: 10,
  },
  progressTrack: {
    width: 200,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    zIndex: 10,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: palette.white,
    borderRadius: 2,
  },
});
