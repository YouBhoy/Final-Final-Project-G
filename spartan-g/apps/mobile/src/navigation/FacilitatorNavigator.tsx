import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  FacilitatorMobileStackParamList,
  FacilitatorMobileTabParamList,
} from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { Feather } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { FacilitatorAssessmentsScreen } from '../screens/assessment/FacilitatorAssessmentsScreen';
import { FacilitatorStudentsScreen } from '../screens/facilitator/FacilitatorStudentsScreen';
import { WorkHoursScreen } from '../screens/facilitator/WorkHoursScreen';
import { SlotsScreen } from '../screens/facilitator/SlotsScreen';
import { AssessmentOverrideListScreen } from '../screens/facilitator/AssessmentOverrideListScreen';
import { AssessmentOverrideDetailScreen } from '../screens/facilitator/AssessmentOverrideDetailScreen';
import { AppointmentsScreen } from '../screens/facilitator/AppointmentsScreen';
import { FacilitatorProfileScreen } from '../screens/facilitator/FacilitatorProfileScreen';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';
import { FacilitatorMessagesScreen } from '../screens/facilitator/MessagesScreen';
import { ConversationDetailScreen } from '../screens/messaging/ConversationDetailScreen';

const Tab = createBottomTabNavigator<FacilitatorMobileTabParamList>();
const Stack = createNativeStackNavigator<FacilitatorMobileStackParamList>();

function FacilitatorTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: lightColors.primary,
        tabBarInactiveTintColor: lightColors.textMuted,
      }}
    >
      <Tab.Screen name="FacilitatorDashboard" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Feather name="grid" size={size} color={color} /> }}>
        {() => <DashboardScreen portalName="Facilitator Portal" />}
      </Tab.Screen>
      <Tab.Screen name="Appointments" options={{ title: 'Appts', tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} /> }}>
        {() => <AppointmentsScreen />}
      </Tab.Screen>
      <Tab.Screen name="Messaging" options={{ title: 'Chats', tabBarIcon: ({ color, size }) => <Feather name="message-circle" size={size} color={color} /> }}>
        {() => <FacilitatorMessagesScreen />}
      </Tab.Screen>
      <Tab.Screen name="WorkHoursSchedule" options={{ title: 'Hours', tabBarIcon: ({ color, size }) => <Feather name="clock" size={size} color={color} /> }}>
        {() => <WorkHoursScreen />}
      </Tab.Screen>
      <Tab.Screen name="AssessmentOverrides" options={{ title: 'Overrides', tabBarIcon: ({ color, size }) => <Feather name="sliders" size={size} color={color} /> }}>
        {() => <AssessmentOverrideListScreen />}
      </Tab.Screen>
      <Tab.Screen name="FacilitatorProfile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}>
        {() => <FacilitatorProfileScreen />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export function FacilitatorNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="FacilitatorTabs"
        component={FacilitatorTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FacilitatorAssessmentsList"
        component={FacilitatorAssessmentsScreen}
        options={{ title: 'Assessments' }}
      />
      <Stack.Screen
        name="FacilitatorStudentsList"
        component={FacilitatorStudentsScreen}
        options={{ title: 'Students' }}
      />
      <Stack.Screen
        name="FacilitatorSlotsList"
        component={SlotsScreen}
        options={{ title: 'Slots' }}
      />
      <Stack.Screen name="AppointmentDetail" options={{ title: 'Appointment' }}>
        {() => <PlaceholderScreen routeName="AppointmentDetail" />}
      </Stack.Screen>
      <Stack.Screen
        name="ConversationDetail"
        component={ConversationDetailScreen}
        options={{ title: 'Conversation' }}
      />
      <Stack.Screen name="ManageCourse" options={{ title: 'Manage Course' }}>
        {() => <PlaceholderScreen routeName="ManageCourse" />}
      </Stack.Screen>
      <Stack.Screen name="GradeSubmission" options={{ title: 'Grade' }}>
        {() => <PlaceholderScreen routeName="GradeSubmission" />}
      </Stack.Screen>
      <Stack.Screen
        name="AssessmentOverrideDetail"
        component={AssessmentOverrideDetailScreen}
        options={{ title: 'Override Attempts' }}
      />
    </Stack.Navigator>
  );
}
