import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

const Stack = createNativeStackNavigator<MobileAuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Login" options={{ title: 'Sign In' }}>
        {() => <PlaceholderScreen routeName="Login" />}
      </Stack.Screen>
      <Stack.Screen name="Register" options={{ title: 'Create Account' }}>
        {() => <PlaceholderScreen routeName="Register" />}
      </Stack.Screen>
      <Stack.Screen name="ForgotPassword" options={{ title: 'Reset Password' }}>
        {() => <PlaceholderScreen routeName="ForgotPassword" />}
      </Stack.Screen>
      <Stack.Screen
        name="WebOnlyRedirect"
        options={{ title: 'Web Portal Required' }}
      >
        {() => <PlaceholderScreen routeName="WebOnlyRedirect" />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
