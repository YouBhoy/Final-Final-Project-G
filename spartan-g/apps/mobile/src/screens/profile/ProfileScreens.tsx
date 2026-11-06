import { useRef, useState } from 'react';
import { ActivityIndicator, AccessibilityInfo, findNodeHandle, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '@spartan-g/shared-services';
import { ALL_CAMPUSES, getCampusLabel, ROLE_LABELS, type Campus } from '@spartan-g/shared-types';
import { currentPreferenceOwner, profilePreferences, useProfilePreferences } from '../../profile/preferences';
import { ProfileHeader, ProfileAvatar, ProfileInfo, ProfileRow, ProfileToggle, profileStyles as styles } from './ProfileDesign';
import type { ProfileRoutes } from './ProfileNavigator';
import { useProfileAccount } from './ProfileAccount';
import { LogoutConfirmation } from './LogoutConfirmation';
import { PhoneNotificationPreparation } from '../../notifications/PhoneNotificationPreparation';
import { PrivateFcmTest } from '../../notifications/PrivateFcmTest';
import { PhoneNotificationPermission } from '../../notifications/PhoneNotificationPermission';
import { installedNotificationRuntime } from '../../notifications/runtime';
import { PrivacyExtras } from './PrivacyExtras';

function useIdentity() {
  const account = useProfileAccount();
  const session = useAuthStore(s => s.session);
  const campus = account.user?.campus || account.profile?.campus || session?.campus;
  return { ...account, session, name: account.user?.displayName || session?.displayName || 'Your account', email: session?.email || account.user?.email || 'Not provided',
    avatar: account.user?.photoURL || account.profile?.avatarUrl,
    campus: campus && ALL_CAMPUSES.includes(campus as Campus) ? getCampusLabel(campus as Campus) : campus };
}
function AccountNotice() {
  const account = useProfileAccount();
  if (!account.loading && !account.error) return null;
  return <View style={styles.notice} accessibilityLiveRegion="polite">
    {account.loading ? <><ActivityIndicator color="#DC2626" /><Text style={styles.neutral}>Loading your profile...</Text></> : <><Text style={styles.error}>{account.error}</Text><Pressable accessibilityRole="button" onPress={account.reload} style={styles.action}><Text style={styles.actionText}>Retry</Text></Pressable></>}
  </View>;
}
function IdentitySummary() {
  const a = useIdentity();
  return <View style={styles.summary}><ProfileAvatar name={a.name} uri={a.avatar} small /><View style={styles.summaryCopy}><Text style={styles.summaryName}>{a.name}</Text><Text style={styles.summaryEmail}>{a.email}</Text></View></View>;
}
function DeviceSettingsRow() {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileRoutes>>();
  return <ProfileRow testID="open-device-settings" title="Notification & lock-screen settings" subtitle="Open the guided notification setup, channel status and Android shortcuts." icon="smartphone" onPress={() => navigation.navigate('NotificationSettings')} />;
}

export function ProfileOverview() {
  const a = useIdentity();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileRoutes>>();
  const [logout, setLogout] = useState(false);
  const logoutTarget = useRef<View>(null);
  const restoreFocus = () => { const handle = findNodeHandle(logoutTarget.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle); };
  return <View style={styles.screen}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} accessibilityElementsHidden={logout} importantForAccessibility={logout ? 'no-hide-descendants' : 'auto'}>
      <ProfileHeader title="My Profile" subtitle="Your account and preferences" />
      <View style={styles.identity}><ProfileAvatar name={a.name} uri={a.avatar} /><Text style={styles.name}>{a.name}</Text><Text style={styles.email}>{a.email}</Text></View>
      <View style={styles.body}><AccountNotice />
        {!!a.owner && <><ProfileRow testID="profile-details-action" title="Profile Details" subtitle="View your personal and academic info" icon="user" onPress={() => navigation.navigate('Details')} />
          <ProfileRow testID="profile-notifications-action" title="Notification Settings" subtitle="Manage your notifications" icon="bell" onPress={() => navigation.navigate('NotificationSettings')} />
          <ProfileRow testID="profile-privacy-action" title="Privacy & Security" subtitle="Manage your privacy and account" icon="shield" onPress={() => navigation.navigate('PrivacySecurity')} />
          <View ref={logoutTarget} collapsable={false}><ProfileRow testID="profile-logout-action" title="Log out" subtitle="Sign out from your account" icon="log-out" onPress={() => setLogout(true)} /></View></>}
      </View>
    </ScrollView>
    {logout && a.owner && <LogoutConfirmation key={a.owner} owner={a.owner} onDismiss={() => { setLogout(false); restoreFocus(); }} />}
  </View>;
}
export function ProfileDetails() {
  const a = useIdentity();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileRoutes>>();
  return <View style={styles.screen}><ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
    <ProfileHeader title="Profile Details" compact back={() => navigation.goBack()} />
    <View style={[styles.body, { marginTop: -12 }]}><AccountNotice />
      {a.owner && !a.loading && !a.error && <><ProfileInfo label="Full name" value={a.user?.displayName || a.session?.displayName} icon="user" /><ProfileInfo label="Email" value={a.session?.email || a.user?.email} icon="mail" />
        <ProfileInfo label="Role" value={a.session ? ROLE_LABELS[a.session.role] : undefined} icon="award" />
        <ProfileInfo label="Year level" value={a.profile?.yearLevel} icon="bar-chart-2" /><ProfileInfo label="Campus" value={a.campus} icon="map-pin" />
        <ProfileInfo label="College" value={a.profile?.college} icon="users" /><ProfileInfo label="Course" value={a.profile?.course} icon="file-text" />
        {a.session?.role === 'facilitator' && <><ProfileInfo label="Phone" value={a.profile?.phone} icon="phone" /><ProfileInfo label="Institution" value={a.profile?.institution} icon="briefcase" /><ProfileInfo label="About" value={a.profile?.bio} icon="info" /></>}
      </>}
    </View>
  </ScrollView></View>;
}
export function NotificationSettings() {
  const a = useIdentity();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileRoutes>>();
  const preferences = useProfilePreferences();
  const owner = currentPreferenceOwner();
  const available = !!owner && preferences.owner === owner && preferences.status === 'ready';
  const disabled = !available || preferences.saving;
  const stagingTransport = !!installedNotificationRuntime?.();
  const change = (field: 'messageBanners' | 'appointmentBanners' | 'foregroundSound', value: boolean) => { if (owner) void profilePreferences.update(owner, field, value); };
  return <View style={styles.screen}><ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
    <ProfileHeader title="Notification Settings" subtitle="Stay updated on what matters to you." back={() => navigation.goBack()} symbol="bell" />
    <View style={styles.body}><IdentitySummary /><PhoneNotificationPermission /><PrivateFcmTest /><PhoneNotificationPreparation />
      <Text accessibilityRole="header" style={styles.section}>WHILE THE APP IS OPEN</Text>
      <View style={styles.notice}><Text style={styles.noticeText}>These preferences affect recognized foreground banners on this device only. Unknown or unsafe push payloads are hidden. They do not revoke OS permissions or stop background delivery already queued by an older version.</Text></View>
      {a.owner && <><ProfileToggle testID="preference-message-banners" title="New messages" subtitle="Show message banners while Spartan-G is open." icon="message-square" value={available && preferences.values.messageBanners} disabled={disabled} onChange={v => change('messageBanners', v)} />
        <ProfileToggle testID="preference-appointment-banners" title="Appointment updates" subtitle="Show existing appointment-event banners while the app is open. This does not schedule reminders." icon="calendar" value={available && preferences.values.appointmentBanners} disabled={disabled} onChange={v => change('appointmentBanners', v)} />
        <ProfileToggle testID="preference-foreground-sound" title="Foreground sound" subtitle="Allow sound for the enabled message and appointment banners. Device settings may also silence sound." icon="volume-2" value={available && preferences.values.foregroundSound} disabled={disabled} onChange={v => change('foregroundSound', v)} />
      </>}
      <PreferenceNotice />
      <Text accessibilityRole="header" style={styles.section}>REGISTRATION & DELIVERY</Text>
      <Text testID="push-registration-status" style={styles.neutral}>{stagingTransport ? 'Device registration: consult the acknowledged staging binding above. Server delivery: not confirmed by Android permission or a binding alone.' : 'Device registration: unavailable for automatic delivery. The private FCM test can check native registration on this phone; its current token is not queried here.'}</Text>
      <Text testID="server-delivery-status" style={styles.neutral}>{stagingTransport ? 'Automatic server delivery: controlled by the separately approved staging service; not verified here.' : 'Automatic server delivery: inactive. Messaging and unread counts are separate from phone notification delivery.'}</Text>
      <View style={styles.notice}><Text style={styles.noticeText}>Your local category and foreground preferences are preserved. Quiet hours, email delivery and scheduled reminders are not active. Permission or a private test token does not activate automatic delivery.</Text></View>
    </View>
  </ScrollView></View>;
}
function PreferenceNotice() {
  const p = useProfilePreferences();
  const owner = currentPreferenceOwner();
  return <View accessibilityLiveRegion="polite">{p.saving ? <Text style={styles.neutral}>Saving preference...</Text> : p.status === 'loading' ? <Text style={styles.neutral}>Loading saved preferences...</Text> : null}
    {!!p.error && <Text style={styles.error}>{p.error}</Text>}{p.status === 'error' && owner && <Pressable testID="retry-preferences" style={styles.action} accessibilityRole="button" onPress={() => void profilePreferences.activate(owner, true)}><Text style={styles.actionText}>Retry preferences</Text></Pressable>}
  </View>;
}
export function PrivacySecurity() {
  const a = useIdentity();
  const navigation = useNavigation<NativeStackNavigationProp<ProfileRoutes>>();
  const preferences = useProfilePreferences(), owner = currentPreferenceOwner();
  const available = !!owner && preferences.owner === owner && preferences.status === 'ready';
  const disabled = !available || preferences.saving;
  return <View style={styles.screen}><ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
    <ProfileHeader title="Privacy & Security" subtitle="Manage your privacy and data settings." back={() => navigation.goBack()} symbol="shield" />
    <View style={styles.body}><IdentitySummary /><Text accessibilityRole="header" style={styles.section}>MESSAGE PRIVACY</Text>
      {a.owner && <ProfileToggle testID="preference-hide-message-banners" title="Hide foreground message banners" subtitle="Hide message banners and their notification-list previews while this app is open. Messages remain available inside your conversations." icon="eye-off" value={available && !preferences.values.messageBanners} disabled={disabled} onChange={value => { if (owner) void profilePreferences.update(owner, 'messageBanners', !value); }} />}
      <PreferenceNotice />
      <View style={styles.notice}><Text style={styles.noticeText}>This is presentation privacy, not encryption or an access-control setting. Background and lock-screen previews are managed in device notification settings.</Text></View><DeviceSettingsRow />
      <Text accessibilityRole="header" style={styles.section}>ACCOUNT SECURITY</Text>
      <ProfileRow title="Current signed-in account" subtitle={a.email} icon="user-check"><Text style={styles.status}>{a.session ? ROLE_LABELS[a.session.role] : 'Unavailable'}</Text></ProfileRow>
      <ProfileRow testID="profile-app-lock" title="Biometric unlock & app lock" subtitle="Configure optional strong device verification and local app protection." icon="lock" onPress={() => navigation.navigate('AppLock')} />
      <ProfileRow title="Sensitive assessment masking" subtitle="Not enabled. This setting would need consistent coverage across assessment screens; scores and risk alerts are unchanged." icon="shield" />
      <ProfileRow testID="profile-session-activity" title="Session activity & trusted devices" subtitle="View this app's current device and the limits of available session information." icon="clock" onPress={() => navigation.navigate('SessionActivity')} />
      <ProfileRow testID="profile-privacy-policy" title="Privacy policy" subtitle="Read the current policy from the same source as the web portal." icon="file-text" onPress={() => navigation.navigate('PrivacyPolicy')} />
      {!!a.owner && <PrivacyExtras />}
    </View>
  </ScrollView></View>;
}
