import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import {
  StudentStackParamList,
  StudentTabParamList,
} from '@/types/navigation.types';
import { useTheme } from '@/hooks/useTheme';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

const Tab = createBottomTabNavigator<StudentTabParamList>();
const Stack = createNativeStackNavigator<StudentStackParamList>();

function StudentTabs() {
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
      <Tab.Screen name="StudentHome" options={{ title: 'Home' }}>
        {() => <PlaceholderScreen routeName="StudentHome" />}
      </Tab.Screen>
      <Tab.Screen name="StudentCourses" options={{ title: 'Courses' }}>
        {() => <PlaceholderScreen routeName="StudentCourses" />}
      </Tab.Screen>
      <Tab.Screen name="StudentAssignments" options={{ title: 'Assignments' }}>
        {() => <PlaceholderScreen routeName="StudentAssignments" />}
      </Tab.Screen>
      <Tab.Screen name="StudentProfile" options={{ title: 'Profile' }}>
        {() => <PlaceholderScreen routeName="StudentProfile" />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function StudentNavigator() {
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
        name="StudentTabs"
        component={StudentTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="CourseDetail" options={{ title: 'Course' }}>
        {() => <PlaceholderScreen routeName="CourseDetail" />}
      </Stack.Screen>
      <Stack.Screen name="AssignmentDetail" options={{ title: 'Assignment' }}>
        {() => <PlaceholderScreen routeName="AssignmentDetail" />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
