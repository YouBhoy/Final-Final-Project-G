import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import {
  ROLES,
  MobileRootStackParamList,
  requiresWebPortal,
} from '@spartan-g/shared-types';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';
import { AuthNavigator } from './AuthNavigator';
import { StudentNavigator } from './StudentNavigator';
import { FacilitatorNavigator } from './FacilitatorNavigator';
import { WebOnlyScreen } from './WebOnlyScreen';
import { mobileLinking } from './linking';

const Stack = createNativeStackNavigator<MobileRootStackParamList>();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={lightColors.primary} />
      <Text style={styles.loadingText}>Loading SPARTAN-G...</Text>
    </View>
  );
}

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  const isLoading = status === 'loading' || !isInitialized;
  const isAuthenticated = status === 'authenticated' && session !== null;
  const role = session?.role ?? null;

  if (isLoading) return <LoadingScreen />;

  if (isAuthenticated && role && requiresWebPortal(role)) {
    return <WebOnlyScreen />;
  }

  return (
    <NavigationContainer linking={mobileLinking}>
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
    backgroundColor: lightColors.background,
    gap: 16,
  },
  loadingText: { color: lightColors.textSecondary },
});
