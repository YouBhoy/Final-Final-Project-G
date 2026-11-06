import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@spartan-g/shared-services';
import { ProfileAccountProvider, type ProfilePortal } from './ProfileAccount';
import { ProfileOverview, ProfileDetails, NotificationSettings, PrivacySecurity } from './ProfileScreens';
import { SessionActivityScreen, PrivacyPolicyScreen } from './SecurityInformationScreens';
import { AppLockSettingsScreen } from './AppLockSettingsScreen';
import { AppSettingsScreen } from './AppSettingsScreen';
export type ProfileRoutes = { Overview: undefined; Details: undefined; NotificationSettings: undefined; PrivacySecurity: undefined; SessionActivity: undefined; PrivacyPolicy: undefined; AppLock: undefined; AppSettings: undefined };
const Stack = createNativeStackNavigator<ProfileRoutes>();
export function ProfileNavigator({ portal }: { portal: ProfilePortal }) {
  const owner = useAuthStore(s => s.session?.role === portal ? s.session.uid : 'unavailable');
  return <ProfileAccountProvider portal={portal}>
    <Stack.Navigator key={owner} initialRouteName="Overview" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFF9FA' } }}>
      <Stack.Screen name="Overview" component={ProfileOverview} />
      <Stack.Screen name="Details" component={ProfileDetails} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettings} />
      <Stack.Screen name="PrivacySecurity" component={PrivacySecurity} />
      <Stack.Screen name="SessionActivity" component={SessionActivityScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      <Stack.Screen name="AppLock" component={AppLockSettingsScreen} />
      <Stack.Screen name="AppSettings" component={AppSettingsScreen} />
    </Stack.Navigator>
  </ProfileAccountProvider>;
}
