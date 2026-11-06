import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ExpandableTabBar } from './ExpandableTabBar';
import { ExpandableNavigationProvider, NavigationAssistantLayer } from './ExpandableNavigationContext';
import { navigationBarHeight } from './expandable-navigation';
import {
  StudentMobileStackParamList,
  StudentMobileTabParamList,
} from '@spartan-g/shared-types';
import { lightColors, palette, forestColors } from '@spartan-g/shared-ui';
import { Feather } from '@expo/vector-icons';
import { SafeScreen } from '../components/SafeScreen';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { AssessmentsListScreen } from '../screens/assessment/AssessmentsListScreen';
import { FindFacilitatorScreen } from '../screens/student/FindFacilitatorScreen';
import { BookAppointmentScreen } from '../screens/student/BookAppointmentScreen';
import { StudentAppointmentsScreen } from '../screens/student/StudentAppointmentsScreen';
import { StudentProfileScreen } from '../screens/student/StudentProfileScreen';
import { AssistantBubble } from '../screens/student/components/AssistantBubble';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';
import { TemplateAssessmentScreen } from '../screens/assessment/TemplateAssessmentScreen';
import { MessagesScreen } from '../screens/student/MessagesScreen';
import { ConversationDetailScreen } from '../screens/messaging/ConversationDetailScreen';
import { GardenScreen } from '../screens/student/GardenScreen';
import { ForestScreen } from '../screens/student/ForestScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { ResourcesScreen } from '../screens/student/ResourcesScreen';
import { CaptureScreenLayout, captureStackTransitions, clearCaptureTransitions } from '../security/ScreenCaptureBoundary';

const Tab = createBottomTabNavigator<StudentMobileTabParamList>();
const Stack = createNativeStackNavigator<StudentMobileStackParamList>();

function StudentTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenLayout={({ route, children }) => <CaptureScreenLayout name={route.name}>{children}</CaptureScreenLayout>}
      tabBar={props => <ExpandableTabBar {...props} portal="student" />}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: lightColors.primary,
        tabBarInactiveTintColor: lightColors.textMuted,
        tabBarStyle: { height: navigationBarHeight(insets.bottom) },
      }}
    >
      <Tab.Screen name="StudentHome" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}>
        {() => (
          <SafeScreen backgroundColor="#FFFAF5">
            <DashboardScreen portalName="Student Portal" />
          </SafeScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="StudentCourses" options={{ title: 'Facilitators', tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }}>
        {() => (
          <SafeScreen backgroundColor={palette.spartanRedDark}>
            <FindFacilitatorScreen />
          </SafeScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="StudentAssignments" options={{ title: 'Assessments', tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} /> }}>
        {() => (
          <SafeScreen backgroundColor={palette.spartanRedDark}>
            <AssessmentsListScreen />
          </SafeScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="StudentGarden" options={{ title: 'Garden', tabBarIcon: ({ color, size }) => <Feather name="feather" size={size} color={color} /> }}>
        {() => (
          <SafeScreen backgroundColor="#143E2C">
            <GardenScreen />
          </SafeScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="StudentAppointments" options={{ title: 'My Appts', tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} /> }}>
        {() => (
          <SafeScreen backgroundColor="#FFF3F4">
            <StudentAppointmentsScreen />
          </SafeScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="StudentMessages" options={{ title: 'Messages', tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} /> }}>
        {() => (
          <SafeScreen backgroundColor={palette.spartanRedDark}>
            <MessagesScreen />
          </SafeScreen>
        )}
      </Tab.Screen>
      <Tab.Screen name="StudentResources" options={{ title: 'Resources' }}>
        {() => <SafeScreen backgroundColor={palette.spartanRedDark}><ResourcesScreen /></SafeScreen>}
      </Tab.Screen>
      <Tab.Screen name="StudentProfile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}>
        {() => (
          <SafeScreen backgroundColor={palette.spartanRedDark}>
            <StudentProfileScreen />
          </SafeScreen>
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function StudentNavigator() {
  useEffect(() => () => clearCaptureTransitions(), []);
  return (
    <Stack.Navigator screenLayout={({ route, children }) => <CaptureScreenLayout name={route.name}>{children}</CaptureScreenLayout>} screenListeners={captureStackTransitions}>
      <Stack.Screen name="StudentTabs" options={{ headerShown: false }}>
        {() => (
          <ExpandableNavigationProvider>
            <StudentTabs />
            <NavigationAssistantLayer><AssistantBubble /></NavigationAssistantLayer>
          </ExpandableNavigationProvider>
        )}
      </Stack.Screen>
      <Stack.Screen
        name="Notifications"
        options={{ headerShown: false }}
      >
        {() => (
          <SafeScreen backgroundColor={palette.spartanRedDark}>
            <NotificationsScreen />
          </SafeScreen>
        )}
      </Stack.Screen>
      <Stack.Screen name="CourseDetail" options={{ title: 'Course' }}>
        {() => <PlaceholderScreen routeName="CourseDetail" />}
      </Stack.Screen>
      <Stack.Screen name="AssignmentDetail" options={{ title: 'Assignment' }}>
        {() => <PlaceholderScreen routeName="AssignmentDetail" />}
      </Stack.Screen>
      <Stack.Screen
        name="ConversationDetail"
        component={ConversationDetailScreen}
        options={{ title: 'Conversation' }}
      />
      <Stack.Screen
        name="AssessmentWizard"
        component={TemplateAssessmentScreen}
        options={{ title: 'Assessment' }}
      />
      <Stack.Screen
        name="BookAppointment"
        component={BookAppointmentScreen}
        options={{ title: 'Book Appointment' }}
      />
      <Stack.Screen
        name="Forest"
        options={{ headerShown: false }}
      >
        {() => (
          <SafeScreen backgroundColor={forestColors.bg}>
            <ForestScreen />
          </SafeScreen>
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
