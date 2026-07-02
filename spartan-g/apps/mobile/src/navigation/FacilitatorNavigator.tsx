import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  FacilitatorMobileStackParamList,
  FacilitatorMobileTabParamList,
} from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { PlaceholderScreen } from './placeholders/PlaceholderScreen';

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
      <Tab.Screen name="FacilitatorDashboard" options={{ title: 'Dashboard' }}>
        {() => <DashboardScreen portalName="Facilitator Portal" />}
      </Tab.Screen>
      <Tab.Screen name="RiskAlerts" options={{ title: 'Risk Alerts' }}>
        {() => <PlaceholderScreen routeName="RiskAlerts" />}
      </Tab.Screen>
      <Tab.Screen name="Appointments" options={{ title: 'Appointments' }}>
        {() => <PlaceholderScreen routeName="Appointments" />}
      </Tab.Screen>
      <Tab.Screen name="Messaging" options={{ title: 'Messages' }}>
        {() => <PlaceholderScreen routeName="Messaging" />}
      </Tab.Screen>
      <Tab.Screen name="WorkHoursSchedule" options={{ title: 'Work Hours' }}>
        {() => <PlaceholderScreen routeName="WorkHoursSchedule" />}
      </Tab.Screen>
      <Tab.Screen name="FacilitatorProfile" options={{ title: 'Profile' }}>
        {() => <PlaceholderScreen routeName="FacilitatorProfile" />}
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
      <Stack.Screen name="RiskAlertDetail" options={{ title: 'Risk Alert' }}>
        {() => <PlaceholderScreen routeName="RiskAlertDetail" />}
      </Stack.Screen>
      <Stack.Screen name="AppointmentDetail" options={{ title: 'Appointment' }}>
        {() => <PlaceholderScreen routeName="AppointmentDetail" />}
      </Stack.Screen>
      <Stack.Screen name="ConversationDetail" options={{ title: 'Conversation' }}>
        {() => <PlaceholderScreen routeName="ConversationDetail" />}
      </Stack.Screen>
      <Stack.Screen name="ManageCourse" options={{ title: 'Manage Course' }}>
        {() => <PlaceholderScreen routeName="ManageCourse" />}
      </Stack.Screen>
      <Stack.Screen name="GradeSubmission" options={{ title: 'Grade' }}>
        {() => <PlaceholderScreen routeName="GradeSubmission" />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
