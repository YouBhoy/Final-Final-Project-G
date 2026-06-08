import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import {
  FacilitatorStackParamList,
  FacilitatorTabParamList,
} from '@/types/navigation.types';
import { useTheme } from '@/hooks/useTheme';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

const Tab = createBottomTabNavigator<FacilitatorTabParamList>();
const Stack = createNativeStackNavigator<FacilitatorStackParamList>();

function FacilitatorTabs() {
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
      <Tab.Screen name="FacilitatorDashboard" options={{ title: 'Dashboard' }}>
        {() => <PlaceholderScreen routeName="FacilitatorDashboard" />}
      </Tab.Screen>
      <Tab.Screen name="FacilitatorCourses" options={{ title: 'Courses' }}>
        {() => <PlaceholderScreen routeName="FacilitatorCourses" />}
      </Tab.Screen>
      <Tab.Screen name="FacilitatorStudents" options={{ title: 'Students' }}>
        {() => <PlaceholderScreen routeName="FacilitatorStudents" />}
      </Tab.Screen>
      <Tab.Screen name="FacilitatorProfile" options={{ title: 'Profile' }}>
        {() => <PlaceholderScreen routeName="FacilitatorProfile" />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function FacilitatorNavigator() {
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
        name="FacilitatorTabs"
        component={FacilitatorTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="ManageCourse" options={{ title: 'Manage Course' }}>
        {() => <PlaceholderScreen routeName="ManageCourse" />}
      </Stack.Screen>
      <Stack.Screen name="GradeSubmission" options={{ title: 'Grade Submission' }}>
        {() => <PlaceholderScreen routeName="GradeSubmission" />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
