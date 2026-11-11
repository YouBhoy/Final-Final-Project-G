import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { useReducedMotionPreference } from '../screens/auth/welcome-motion';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';
import { CaptureScreenLayout } from '../security/ScreenCaptureBoundary';

const Stack = createNativeStackNavigator<MobileAuthStackParamList>();

export function AuthNavigator() {
  const reducedMotion = useReducedMotionPreference();
  return (
    <Stack.Navigator initialRouteName="Welcome" screenLayout={({ route, children }) => <CaptureScreenLayout name={route.name}>{children}</CaptureScreenLayout>} screenOptions={{ animation: reducedMotion ? 'none' : 'fade' }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In' }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create Account' }} />
      <Stack.Screen
        name="WebOnlyRedirect"
        options={{ title: 'Web Portal Required' }}
      >
        {() => <PlaceholderScreen routeName="WebOnlyRedirect" />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
