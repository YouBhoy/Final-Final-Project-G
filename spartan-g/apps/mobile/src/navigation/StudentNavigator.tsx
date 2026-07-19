import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  StudentMobileStackParamList,
  StudentMobileTabParamList,
} from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { Feather } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { AssessmentsListScreen } from '../screens/assessment/AssessmentsListScreen';
import { FindFacilitatorScreen } from '../screens/student/FindFacilitatorScreen';
import { BookAppointmentScreen } from '../screens/student/BookAppointmentScreen';
import { StudentAppointmentsScreen } from '../screens/student/StudentAppointmentsScreen';
import { StudentProfileScreen } from '../screens/student/StudentProfileScreen';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';
import { TemplateAssessmentScreen } from '../screens/assessment/TemplateAssessmentScreen';
import { MessagesScreen } from '../screens/student/MessagesScreen';
import { ConversationDetailScreen } from '../screens/messaging/ConversationDetailScreen';

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
      <Tab.Screen name="StudentHome" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} /> }}>
        {() => <DashboardScreen portalName="Student Portal" />}
      </Tab.Screen>
      <Tab.Screen name="StudentCourses" options={{ title: 'Facilitators', tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }}>
        {() => <FindFacilitatorScreen />}
      </Tab.Screen>
      <Tab.Screen name="StudentAssignments" options={{ title: 'Assessments', tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} /> }}>
        {() => <AssessmentsListScreen />}
      </Tab.Screen>
      <Tab.Screen name="StudentMessages" options={{ title: 'Messages', tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} /> }}>
        {() => <MessagesScreen />}
      </Tab.Screen>
      <Tab.Screen name="StudentProfile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}>
        {() => <StudentProfileScreen />}
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
        name="StudentAppointments"
        component={StudentAppointmentsScreen}
        options={{ title: 'My Appointments' }}
      />
    </Stack.Navigator>
  );
}