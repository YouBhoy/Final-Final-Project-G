import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import {
  SuperAdminStackParamList,
  SuperAdminTabParamList,
} from '@/types/navigation.types';
import { useTheme } from '@/hooks/useTheme';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

const Tab = createBottomTabNavigator<SuperAdminTabParamList>();
const Stack = createNativeStackNavigator<SuperAdminStackParamList>();

function SuperAdminTabs() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBar,
          borderTopColor: theme.colors.tabBarBorder,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tab.Screen name="AdminDashboard" options={{ title: 'Dashboard' }}>
        {() => <PlaceholderScreen routeName="AdminDashboard" />}
      </Tab.Screen>
      <Tab.Screen name="AdminUsers" options={{ title: 'Users' }}>
        {() => <PlaceholderScreen routeName="AdminUsers" />}
      </Tab.Screen>
      <Tab.Screen name="AdminAnalytics" options={{ title: 'Analytics' }}>
        {() => <PlaceholderScreen routeName="AdminAnalytics" />}
      </Tab.Screen>
      <Tab.Screen name="AdminSettings" options={{ title: 'Settings' }}>
        {() => <PlaceholderScreen routeName="AdminSettings" />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function SuperAdminNavigator() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen
        name="SuperAdminTabs"
        component={SuperAdminTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="UserDetail" options={{ title: 'User Detail' }}>
        {() => <PlaceholderScreen routeName="UserDetail" />}
      </Stack.Screen>
      <Stack.Screen name="PlatformSettings" options={{ title: 'Platform Settings' }}>
        {() => <PlaceholderScreen routeName="PlatformSettings" />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
