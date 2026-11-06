import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileHeader, profileStyles as styles } from './ProfileDesign';
import type { ProfileRoutes } from './ProfileNavigator';

export function AppSettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileRoutes>>();
  // Preserve restored AppSettings navigation without another settings hub.
  useEffect(() => { navigation.replace('PrivacySecurity'); }, [navigation]);
  return <View style={styles.screen}><ProfileHeader title="Settings" back={() => navigation.goBack()} />
    <Text accessibilityLiveRegion="polite" style={styles.neutral}>Opening Privacy &amp; Security. Notification preferences remain in Notification Settings.</Text></View>;
}
