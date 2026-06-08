import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthStackParamList } from '@/types/navigation.types';
import { useTheme } from '@/hooks/useTheme';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="Login" options={{ title: 'Sign In' }}>
        {() => <PlaceholderScreen routeName="Login" />}
      </Stack.Screen>
      <Stack.Screen name="Register" options={{ title: 'Create Account' }}>
        {() => <PlaceholderScreen routeName="Register" />}
      </Stack.Screen>
      <Stack.Screen name="ForgotPassword" options={{ title: 'Reset Password' }}>
        {() => <PlaceholderScreen routeName="ForgotPassword" />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
