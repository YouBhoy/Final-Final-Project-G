import { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, Image, Animated, Easing, StyleSheet, Dimensions, Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  ROLES,
  MobileRootStackParamList,
  requiresWebPortal,
} from '@spartan-g/shared-types';
import { useAuthStore } from '@spartan-g/shared-services';
import { palette } from '@spartan-g/shared-ui';
import { AuthNavigator } from './AuthNavigator';
import { StudentNavigator } from './StudentNavigator';
import { FacilitatorNavigator } from './FacilitatorNavigator';
import { WebOnlyScreen } from './WebOnlyScreen';
import { mobileLinking } from './linking';

const Stack = createNativeStackNavigator<MobileRootStackParamList>();
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function LoadingScreen() {
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
    animation.start();
    return () => animation.stop();
  }, [fillWidth]);

  const barWidth = fillWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.loading}>
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
    </View>
  );
}

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const navigationRef = useRef<any>(null);

  const isLoading = status === 'loading' || !isInitialized;
  const isAuthenticated = status === 'authenticated' && session !== null;
  const role = session?.role ?? null;

  // Handle notification taps — deep-link to the URL in the notification data
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url as string | undefined;
      if (url && navigationRef.current) {
        // Use the existing linking config to navigate
        navigationRef.current.navigate(url);
      } else if (url) {
        // Fallback: open via Linking
        Linking.openURL(url).catch(() => {
          // Silently fail — app will open to default screen
        });
      }
    });

    return () => subscription.remove();
  }, []);

  if (isLoading) return <LoadingScreen />;

  if (isAuthenticated && role && requiresWebPortal(role)) {
    return <WebOnlyScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef} linking={mobileLinking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated || !role ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : role === ROLES.FACILITATOR ? (
          <Stack.Screen name="Facilitator" component={FacilitatorNavigator} />
        ) : (
          <Stack.Screen name="Student" component={StudentNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
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