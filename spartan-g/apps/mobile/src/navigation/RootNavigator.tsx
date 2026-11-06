import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  ROLES,
  MobileRootStackParamList,
  requiresWebPortal,
} from '@spartan-g/shared-types';
import { useAuthStore } from '@spartan-g/shared-services';
import { BrandedLoadingScreen } from '../components/BrandedLoadingScreen';
import { AuthNavigator } from './AuthNavigator';
import { StudentNavigator } from './StudentNavigator';
import { FacilitatorNavigator } from './FacilitatorNavigator';
import { WebOnlyScreen } from './WebOnlyScreen';
import { mobileLinking } from './linking';
import { navigationRef } from './navigationRef';
import { CaptureScreenLayout } from '../security/ScreenCaptureBoundary';

const Stack = createNativeStackNavigator<MobileRootStackParamList>();
export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const isInitialized = useAuthStore((s) => s.isInitialized);

  const isLoading = status === 'loading' || !isInitialized;
  const isAuthenticated = status === 'authenticated' && session !== null;
  const role = session?.role ?? null;

  // Native notification responses are coordinated outside the biometric boundary.
  if (isLoading) return <BrandedLoadingScreen />;

  if (isAuthenticated && role && requiresWebPortal(role)) {
    return <WebOnlyScreen />;
  }

  return (
    <NavigationContainer ref={navigationRef} linking={mobileLinking}>
      <Stack.Navigator screenOptions={{ headerShown: false }} screenLayout={({ route, children }) => <CaptureScreenLayout name={route.name}>{children}</CaptureScreenLayout>}>
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

