import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  StudentMobileStackParamList,
  StudentMobileTabParamList,
} from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

const Tab = createBottomTabNavigator<StudentMobileTabParamList>();
const Stack = createNativeStackNavigator<StudentMobileStackParamList>();

function StudentTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: lightColors.primary,
        tabBarInactiveTintColor: lightColors.textMuted,
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
      <Tab.Screen name="StudentMessages" options={{ title: 'Messages' }}>
        {() => <PlaceholderScreen routeName="StudentMessages" />}
      </Tab.Screen>
      <Tab.Screen name="StudentProfile" options={{ title: 'Profile' }}>
        {() => <PlaceholderScreen routeName="StudentProfile" />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function StudentNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="StudentTabs" component={StudentTabs} options={{ headerShown: false }} />
      <Stack.Screen name="CourseDetail" options={{ title: 'Course' }}>
        {() => <PlaceholderScreen routeName="CourseDetail" />}
      </Stack.Screen>
      <Stack.Screen name="AssignmentDetail" options={{ title: 'Assignment' }}>
        {() => <PlaceholderScreen routeName="AssignmentDetail" />}
      </Stack.Screen>
      <Stack.Screen name="ConversationDetail" options={{ title: 'Conversation' }}>
        {() => <PlaceholderScreen routeName="ConversationDetail" />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
