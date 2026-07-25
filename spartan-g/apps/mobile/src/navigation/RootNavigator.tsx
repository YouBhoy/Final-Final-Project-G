import { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, Image, Animated, Easing, StyleSheet, Linking } from 'react-native';
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
  },
  progressTrack: {
    width: 200,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
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