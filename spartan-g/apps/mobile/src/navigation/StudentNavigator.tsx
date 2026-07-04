import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  StudentMobileStackParamList,
  StudentMobileTabParamList,
} from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { AssessmentsListScreen } from '../screens/assessment/AssessmentsListScreen';
import { FindFacilitatorScreen } from '../screens/student/FindFacilitatorScreen';
import { BookAppointmentScreen } from '../screens/student/BookAppointmentScreen';
import { StudentAppointmentsScreen } from '../screens/student/StudentAppointmentsScreen';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';
import { TemplateAssessmentScreen } from '../screens/assessment/TemplateAssessmentScreen';

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
        {() => <DashboardScreen portalName="Student Portal" />}
      </Tab.Screen>
      <Tab.Screen name="StudentCourses" options={{ title: 'Facilitators' }}>
        {() => <FindFacilitatorScreen />}
      </Tab.Screen>
      <Tab.Screen name="StudentAssignments" options={{ title: 'Assessments' }}>
        {() => <AssessmentsListScreen />}
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