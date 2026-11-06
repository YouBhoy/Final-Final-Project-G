import { useState } from 'react';
import { ActivityIndicator, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthSession, StudentMobileStackParamList } from '@spartan-g/shared-types';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { inspiration } from '../student/resources-model';
import { useStudentDashboard } from './use-student-dashboard';
import { useDashboardMotion } from './dashboard-motion';
import { CardFoliage, DashboardHeaderArt, StudentAvatarArt } from './DashboardArtwork';
import { DashboardMascot } from './DashboardMascot';
import { AssessmentJourney, DashboardButton, Entrance, dashboardColors as colors } from './DashboardPresentation';

export function DashboardScreen(_props: { portalName: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const data = useStudentDashboard();
  const { width, fontScale } = useWindowDimensions();
  const [mascotReady, setMascotReady] = useState(false);
  const motion = useDashboardMotion(data.authorized ? data.session!.uid : null, data.journey?.phase === 'in_progress', mascotReady);
  const [screeningOwner, setScreeningOwner] = useState<AuthSession | null>(null);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const largeText = fontScale > 1.25;
  const narrow = width < 360;
  const name = (data.name || data.session?.displayName || 'Spartan').trim().split(/\s+/)[0] || 'Spartan';
  const screeningVisible = !!screeningOwner && screeningOwner === data.session && data.authorized && motion.focused;
  const go = (screen: 'StudentAssignments' | 'StudentAppointments' | 'StudentMessages' | 'StudentProfile' | 'StudentResources') => {
    if (data.current()) navigation.navigate('StudentTabs', { screen });
  };
  const continueAssessment = () => {
    if (!data.current()) return;
    if (data.journey?.resumeAttemptId) navigation.navigate('AssessmentWizard', { assessmentId: data.journey.resumeAttemptId });
    else go('StudentAssignments');
  };
  if (!data.authorized) return <View style={styles.container}><Text style={styles.signedOut}>Sign in to view your dashboard.</Text></View>;
  return <View testID="student-dashboard" style={styles.container}>
    {motion.focused && <StatusBar style="dark" />}
    <View pointerEvents="none" style={styles.headerArt}><DashboardHeaderArt /></View>
    <ScrollView testID="dashboard-scroll" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} importantForAccessibility={screeningVisible ? 'no-hide-descendants' : 'auto'} refreshControl={<RefreshControl refreshing={data.loading && data.owner === data.session} onRefresh={data.reload} tintColor={colors.red} colors={[colors.red]} />}>
      <Entrance progress={motion.header}>
        <View style={styles.brandRow}>
          <View style={styles.brand}><Text accessibilityRole="header" maxFontSizeMultiplier={1.1} style={styles.wordmark}>SPARTAN-G</Text><Text maxFontSizeMultiplier={1.3} style={styles.university}>BATANGAS STATE UNIVERSITY</Text></View>
          <DashboardButton testID="dashboard-notifications" label={`Open notifications${data.unreadNotifications ? `, ${data.unreadNotifications} unread` : ''}`} motion={motion.allowed} onPress={() => { if (data.current()) navigation.navigate('Notifications'); }} style={styles.bell}>
            <Feather name="bell" size={23} color="#79241F" />{data.unreadNotifications > 0 && <View testID="dashboard-notification-dot" style={styles.bellDot} />}
          </DashboardButton>
        </View>
        <View style={[styles.greeting, largeText && styles.greetingLarge]}>
          <DashboardButton testID="dashboard-profile-avatar" label="Open your profile" motion={motion.allowed} onPress={() => go('StudentProfile')} style={[styles.avatar, narrow && styles.avatarSmall]}>
            {data.avatar && failedAvatar !== data.avatar ? <Image testID="dashboard-profile-photo" source={{ uri: data.avatar }} style={styles.avatarImage} onError={() => setFailedAvatar(data.avatar)} accessibilityLabel="Your profile photo" /> : <StudentAvatarArt />}
          </DashboardButton>
          {largeText && <DashboardMascot progress={motion.mascot} screenWidth={width} compact onLoad={() => setMascotReady(true)} />}
          <View style={[styles.greetingCopy, largeText && styles.greetingCopyLarge]}><Text testID="dashboard-greeting" accessibilityRole="header" style={[styles.greetingTitle, narrow && styles.greetingSmall]}>Hey, {name}!</Text><Text style={styles.tagline}>One step at a time.</Text></View>
          {!largeText && <DashboardMascot progress={motion.mascot} screenWidth={width} compact={narrow} onLoad={() => setMascotReady(true)} />}
        </View>
      </Entrance>
      {data.errors.length > 0 && <View testID="dashboard-data-notice" style={styles.notice} accessibilityLiveRegion="polite"><Text style={styles.noticeText}>{data.errors.join(' ')} Pull down to retry.</Text></View>}
      <Entrance progress={motion.journey}><AssessmentJourney inProgress={data.journey?.inProgress ?? null} completed={data.journey?.completed ?? null} phase={data.journey?.phase ?? null} loading={data.loading} motion={motion} largeText={largeText} onPress={continueAssessment} /></Entrance>
      <Entrance progress={motion.cards} style={[styles.secondaryRow, (narrow || largeText) && styles.secondaryStack]}>
        <View style={styles.secondaryCell}><DashboardButton testID="dashboard-appointments" label="View your appointments" motion={motion.allowed} onPress={() => go('StudentAppointments')} style={[styles.secondary, styles.appointment]}>
          <CardFoliage /><View style={[styles.secondaryIcon, styles.calendarIcon]}><Feather name="calendar" size={27} color={colors.red} /></View>
          <View style={styles.secondaryCopy}><Text style={styles.secondaryTitle}>Next appointment</Text><Text testID="dashboard-next-appointment" style={styles.secondaryCaption}>{data.errors.includes('Appointments are unavailable.') ? 'Unavailable' : data.appointment ?? (data.loading ? 'Loading…' : 'None scheduled')}</Text></View><Feather name="chevron-right" size={16} color="#152340" />
        </DashboardButton></View>
        <View style={styles.secondaryCell}><DashboardButton testID="dashboard-messages" label="Open your messages" motion={motion.allowed} onPress={() => go('StudentMessages')} style={[styles.secondary, styles.messages]}>
          <CardFoliage cool /><View style={[styles.secondaryIcon, styles.messageIcon]}><Feather name="message-circle" size={27} color="#112944" /></View>
          <View style={styles.secondaryCopy}><Text style={styles.secondaryTitle}>Messages</Text><Text testID="dashboard-unread-messages" style={styles.secondaryCaption}>{data.messages === null ? data.loading ? 'Loading…' : 'Unavailable' : `${data.messages} unread`}</Text></View><Feather name="chevron-right" size={16} color="#152340" />
        </DashboardButton></View>
      </Entrance>
      <Entrance progress={motion.info}>
        <DashboardButton testID="dashboard-screening-info" label="About your screening" motion={motion.allowed} onPress={() => { if (data.current()) setScreeningOwner(data.session); }} style={styles.info}><View style={styles.infoIcon}><Feather name="info" size={25} color="#12203C" /></View><Text style={styles.infoTitle}>About your screening</Text><Feather name="chevron-right" size={22} color="#152340" /></DashboardButton>
      </Entrance>
      {data.loading && !data.journey && <View style={styles.loading} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.red} size="small" /><Text style={styles.secondaryCaption}>Loading your dashboard…</Text></View>}
    </ScrollView>
    <Modal visible={screeningVisible} transparent animationType={motion.allowed ? 'fade' : 'none'} onRequestClose={() => setScreeningOwner(null)}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={styles.modalContent}><Text accessibilityRole="header" style={styles.modalTitle}>About your screening</Text>
          <Text style={styles.modalCopy}>Your wellbeing matters. This screening helps the Office of Guidance and Counseling understand how you’re doing so we can connect you with the right support.</Text>
          <Text style={styles.modalCopy}>It is not a diagnostic tool — think of it as a conversation starter. Your responses are confidential and protected by the application’s account access controls. Authorized guidance staff may review them to provide support.</Text>
          <Text style={styles.modalCopy}>Be honest with your responses. Completing a questionnaire does not replace a professional consultation.</Text>
          <View testID="dashboard-encouragement" style={styles.encouragement}><Feather name="sun" size={22} color={colors.red} /><View style={{ flex: 1 }}><Text style={styles.encouragementTitle}>Daily Encouragement</Text><Text style={styles.modalCopy}>{inspiration[(new Date().getDate() - 1) % inspiration.length]}</Text></View></View>
          <View testID="dashboard-resources"><DashboardButton testID="dashboard-explore-resources" label="Explore Resources" motion={motion.allowed} onPress={() => { setScreeningOwner(null); go('StudentResources'); }} style={styles.resources}><Feather name="book-open" size={16} color={colors.crimson} /><Text style={styles.resourcesText}>Explore Resources</Text><Feather name="arrow-right" size={16} color={colors.crimson} /></DashboardButton></View>
        </ScrollView>
        <DashboardButton testID="dashboard-screening-close" label="Close screening information" motion={motion.allowed} onPress={() => setScreeningOwner(null)} style={styles.modalClose}><Text style={styles.closeText}>Got it</Text></DashboardButton>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  headerArt: { position: 'absolute', left: 0, right: 0, top: 0, height: 245 },
  content: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 112, gap: 14, flexGrow: 1 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9, paddingTop: 5, gap: 12, zIndex: 1 },
  brand: { flex: 1, minWidth: 0 }, wordmark: { fontFamily: 'sans-serif', fontSize: 23, fontWeight: '800', letterSpacing: -0.6, color: '#C90025' },
  university: { fontSize: 6.8, lineHeight: 13, letterSpacing: 2.1, color: '#496076', fontWeight: '800' },
  bell: { minWidth: 44, minHeight: 44, borderRadius: 24, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', borderColor: '#FFFFFF', borderWidth: 2, transform: [{ translateY: -8 }] },
  bellDot: { position: 'absolute', top: 0, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: '#E92643', borderWidth: 1.5, borderColor: '#FFFFFF' },
  greeting: { flexDirection: 'row', alignItems: 'center', paddingTop: 5, paddingBottom: 3, marginTop: -8, gap: 9, minHeight: 122 }, greetingLarge: { flexWrap: 'wrap', paddingTop: 12, justifyContent: 'space-between' },
  greetingCopyLarge: { flexBasis: '100%', flexGrow: 0, paddingTop: 0 },
  greetingCopy: { flex: 1, minWidth: 80, paddingVertical: 8 }, greetingTitle: { color: '#1E1015', fontFamily: 'sans-serif', fontSize: 27, lineHeight: 34, fontWeight: '700', letterSpacing: -0.9 }, greetingSmall: { fontSize: 24, lineHeight: 31 },
  tagline: { fontFamily: 'sans-serif', fontSize: 17, lineHeight: 24, color: '#71635E', marginTop: 2, letterSpacing: -0.3 },
  avatar: { width: 70, height: 70, borderRadius: 36, borderWidth: 4, borderColor: '#FFFFFF', backgroundColor: '#FFC5BA', overflow: 'hidden', shadowColor: '#C86F66', shadowOpacity: 0.1, shadowRadius: 8 }, avatarSmall: { width: 58, height: 58, borderRadius: 29, borderWidth: 3 }, avatarImage: { width: '100%', height: '100%' },
  secondaryRow: { flexDirection: 'row', alignItems: 'stretch', gap: 9 }, secondaryStack: { flexDirection: 'column' }, secondaryCell: { flex: 1, minWidth: 0 },
  secondary: { minHeight: 98, borderRadius: 21, paddingHorizontal: 9, paddingVertical: 16, borderColor: '#FFFFFF', borderWidth: 1.5, flexDirection: 'row', gap: 7, alignItems: 'center', overflow: 'hidden' }, appointment: { backgroundColor: '#FFF0EB' }, messages: { backgroundColor: '#EAF7FA' },
  secondaryIcon: { width: 40, height: 44, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, calendarIcon: { backgroundColor: '#FFD8D3' }, messageIcon: { backgroundColor: '#C6E8FB' }, secondaryCopy: { flex: 1, minWidth: 0 },
  secondaryTitle: { fontFamily: 'sans-serif', fontSize: 14, lineHeight: 18, fontWeight: '700', letterSpacing: -0.3, color: '#121D35' }, secondaryCaption: { fontFamily: 'sans-serif', fontSize: 12, lineHeight: 18, color: '#58667A', marginTop: 3 },
  info: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 13, minHeight: 62, borderRadius: 20, borderWidth: 1.5, borderColor: '#FFFFFF', backgroundColor: '#FFFFFFAA', gap: 13 }, infoIcon: { width: 37, height: 37, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0E8E1' }, infoTitle: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '500', color: '#17213D' },
  resources: { flexDirection: 'row', gap: 8, alignItems: 'center', alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 12, minHeight: 44 }, resourcesText: { fontSize: 12, color: colors.crimson, fontWeight: '600' },
  notice: { backgroundColor: '#FFF0DD', borderWidth: 1, borderColor: '#F4D3AA', padding: 12, borderRadius: 15 }, noticeText: { fontSize: 13, lineHeight: 19, color: '#734325' }, loading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }, signedOut: { color: colors.ink, padding: 24 },
  modalBackdrop: { flex: 1, backgroundColor: '#20132366', justifyContent: 'center', padding: 22 }, modalCard: { maxHeight: '85%', borderRadius: 25, padding: 20, backgroundColor: colors.cream, gap: 12 }, modalContent: { gap: 16 }, modalTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '800' }, modalCopy: { color: '#625458', fontSize: 15, lineHeight: 23 }, modalClose: { minHeight: 48, borderRadius: 24, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', padding: 12 }, closeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 }, encouragement: { flexDirection: 'row', gap: 12, paddingTop: 5 }, encouragementTitle: { color: colors.crimson, fontWeight: '700', fontSize: 15, marginBottom: 7 },
});
