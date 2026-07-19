import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

const Stack = createNativeStackNavigator<MobileAuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator>
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
