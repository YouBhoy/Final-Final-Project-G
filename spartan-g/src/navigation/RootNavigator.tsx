import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ROLES } from '@/constants/roles';
import { useAuth } from '@/auth/useAuth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RootStackParamList } from '@/types/navigation.types';

import { AuthNavigator } from './AuthNavigator';
import { StudentNavigator } from './StudentNavigator';
import { FacilitatorNavigator } from './FacilitatorNavigator';
import { SuperAdminNavigator } from './SuperAdminNavigator';
import { linking } from './linking';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isLoading, isAuthenticated, role } = useAuth();

  if (isLoading) {
    return <LoadingSpinner fullScreen message="Loading SPARTAN-G..." />;
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated || !role ? (
          <Stack.Screen name="Auth" component={AuthNavigator} />
        ) : role === ROLES.SUPER_ADMIN ? (
          <Stack.Screen name="SuperAdmin" component={SuperAdminNavigator} />
        ) : role === ROLES.FACILITATOR ? (
          <Stack.Screen name="Facilitator" component={FacilitatorNavigator} />
        ) : (
          <Stack.Screen name="Student" component={StudentNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
