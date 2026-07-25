import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, assessmentService, appointmentRepository, messagingService } from '@spartan-g/shared-services';
import { lightColors, palette } from '@spartan-g/shared-ui';

/* ─── Circular Progress Component ─────────────────────────── */
function CircularProgress({ value, size = 104, strokeWidth = 8 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background ring */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: palette.slate200,
        }}
      />
      {/* Progress arc — we use a simple approach: a semi-circle overlay */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: 'transparent',
          borderTopColor: palette.spartanGold,
          borderRightColor: value > 50 ? palette.spartanGold : 'transparent',
          borderBottomColor: value > 75 ? palette.spartanGold : 'transparent',
          transform: [{ rotate: '-90deg' }],
        }}
      />
      {/* Center text */}
      <Text style={{ fontSize: 22, fontWeight: '800', color: lightColors.text }}>
        {Math.round(value)}%
      </Text>
    </View>
  );
}

/* ─── Stat Card ────────────────────────────────────────────── */
interface StatCardProps {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  caption?: string;
}

function StatCard({ icon, iconBg, iconColor, label, value, caption }: StatCardProps) {
  return (
    <View style={[styles.statCard, { width: '48%' }]}>
      <View style={[styles.statIconContainer, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={styles.statContent}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
        {caption && <Text style={styles.statCaption}>{caption}</Text>}
      </View>
    </View>
  );
}

/* ─── Quick Action Item ────────────────────────────────────── */
interface QuickActionProps {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  onPress: () => void;
}

function QuickActionItem({ icon, iconBg, iconColor, label, onPress }: QuickActionProps) {
  return (
    <TouchableOpacity style={styles.quickActionItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.quickActionIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon as any} size={16} color={iconColor} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DashboardScreen({ portalName }: DashboardScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const role = session?.role ?? null;
  const displayName = session?.displayName ?? 'User';
  const userId = session?.uid ?? '';
  const firstName = displayName.split(' ')[0];

  // Dashboard data state
  const [assessmentsCompleted, setAssessmentsCompleted] = useState(0);
  const [totalAssessments, setTotalAssessments] = useState(0);
  const [inProgress, setInProgress] = useState(0);
  const [notStarted, setNotStarted] = useState(0);
  const [nextAppointment, setNextAppointment] = useState<string | null>(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch real dashboard data — wrapped in a callable function so we can
  // both run it on mount and re-run it when the screen gains focus.
  const loadDashboardData = useCallback(async () => {
    if (!userId || role !== 'student') {
      setIsLoadingData(false);
      return;
    }

    try {
      // ── Assessment data (Phase 3B: assessment_attempts collection) ──
      // Query assessment_attempts filtered by studentId with status submitted/graded.
      // This matches the data model used by submit, resume, and attempt-override logic.
      const attempts = await assessmentService.getAttemptsByStudent(userId);
      const submitted = attempts.filter((a) => a.status === 'submitted' || a.status === 'graded');
      const inProg = attempts.filter((a) => a.status === 'in_progress');
      setAssessmentsCompleted(submitted.length);
      setInProgress(inProg.length);
      setTotalAssessments(attempts.length);

      // Not started is not applicable to Phase 3B (assessments are course-based,
      // not template-based). We set it to 0 to avoid confusion.
      setNotStarted(0);

      // ── Next appointment ──
      const appointments = await appointmentRepository.getByStudent(userId);
      const now = new Date();
      const upcoming = appointments
        .filter((a) => {
          // Only future appointments with active statuses
          const aptTime = a.scheduledAt?.toDate?.();
          return aptTime && aptTime > now && (a.status === 'accepted' || a.status === 'requested');
        })
        .sort((a, b) => {
          const aTime = a.scheduledAt?.toDate?.()?.getTime() ?? 0;
          const bTime = b.scheduledAt?.toDate?.()?.getTime() ?? 0;
          return aTime - bTime;
        });
      if (upcoming.length > 0) {
        const next = upcoming[0].scheduledAt?.toDate?.();
        if (next) {
          const isToday = next.toDateString() === now.toDateString();
          const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === next.toDateString();
          const timeStr = next.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
          if (isToday) {
            setNextAppointment(`Today · ${timeStr}`);
          } else if (isTomorrow) {
            setNextAppointment(`Tomorrow · ${timeStr}`);
          } else {
            setNextAppointment(next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` · ${timeStr}`);
          }
        }
      } else {
        setNextAppointment(null);
      }

      // ── Unread messages (sum of unreadCount across conversations) ──
      const conversations = await messagingService.getConversations(userId, 'student');
      const totalUnread = conversations.reduce(
        (sum, c) => sum + (c.unreadCount?.[userId] ?? 0),
        0,
      );
      setUnreadMessages(totalUnread);
    } catch {
      // Silently fail — dashboard shows zeros gracefully
    } finally {
      setIsLoadingData(false);
    }
  }, [userId, role]);

  // Fetch on mount + initial data load
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Re-fetch every time this screen gains focus (so data is fresh after
  // submitting an assessment, booking/cancelling an appointment, etc.)
  useFocusEffect(
    useCallback(() => {
      // Only re-fetch if we've already completed the first load
      if (!isLoadingData) {
        loadDashboardData();
      }
    }, [loadDashboardData, isLoadingData]),
  );

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadDashboardData();
    setIsRefreshing(false);
  }, [loadDashboardData]);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const handleNavigateToAssessments = useCallback(() => {
    navigation?.navigate('StudentTabs', { screen: 'StudentAssignments' });
  }, [navigation]);

  const handleFindFacilitator = useCallback(() => {
    navigation?.navigate('StudentTabs', { screen: 'StudentCourses' });
  }, [navigation]);

  const handleBookAppointment = useCallback(() => {
    navigation?.navigate('BookAppointment', { facilitatorId: '' });
  }, [navigation]);

  const handleViewAppointments = useCallback(() => {
    navigation?.navigate('StudentTabs', { screen: 'StudentHome' });
  }, [navigation]);

  const assessmentPercent = totalAssessments > 0
    ? Math.round((assessmentsCompleted / totalAssessments) * 100)
    : 0;

  return (
    <View style={styles.container}>
      {/* ─── Greeting row on maroon background ─────────────────── */}
      <View style={styles.greetingRow}>
        <Text style={styles.greetingText}>Hello, {firstName}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.notificationBell} activeOpacity={0.7}>
            <Feather name="bell" size={22} color={palette.spartanGold} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Feather name="log-out" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── White content sheet ───────────────────────────────── */}
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={palette.spartanRed} />
        }
      >
        {/* Loading state */}
        {isLoadingData && !isRefreshing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={lightColors.primary} />
            <Text style={styles.loadingText}>Loading your dashboard...</Text>
          </View>
        )}

        {/* ─── Student-specific content ─────────────────────────── */}
        {role === 'student' && (
          <>
            {/* Disclaimer */}
            <View style={styles.disclaimerCard}>
              <View style={styles.disclaimerIconContainer}>
                <Feather name="info" size={18} color={lightColors.info} />
              </View>
              <View style={styles.disclaimerContent}>
                <Text style={styles.disclaimerTitle}>About This Screening</Text>
                <Text style={styles.disclaimerText}>
                  Your wellbeing matters. This screening helps the Office of Guidance and Counseling understand how you're doing so we can connect you with the right support. It is not a diagnostic tool — think of it as a conversation starter. Everything you share is confidential and protected.
                </Text>
              </View>
            </View>

            {/* Stat Cards 2x2 Grid */}
            <View style={styles.statsGrid}>
              <StatCard
                icon="clipboard"
                iconBg={palette.red100}
                iconColor={palette.spartanRed}
                label="Assessments Completed"
                value={totalAssessments > 0 ? `${assessmentsCompleted}/${totalAssessments}` : '0'}
                caption={totalAssessments - assessmentsCompleted > 0 ? `${totalAssessments - assessmentsCompleted} remaining` : undefined}
              />
              <StatCard
                icon="calendar"
                iconBg={palette.indigo50}
                iconColor={palette.indigo700}
                label="Next Appointment"
                value={nextAppointment ?? 'None scheduled'}
              />
              <StatCard
                icon="clock"
                iconBg={palette.red100}
                iconColor={palette.spartanRed}
                label="In Progress Assessments"
                value={inProgress > 0 ? `${inProgress} in progress` : 'None'}
              />
              <StatCard
                icon="message-circle"
                iconBg={palette.green100}
                iconColor={palette.success}
                label="Unread Messages"
                value={String(unreadMessages)}
                caption="From your facilitators"
              />
            </View>

            {/* Assessment Progress + Quick Actions */}
            <View style={styles.twoColumnSection}>
              {/* Assessment Progress */}
              <View style={styles.progressCard}>
                <View style={styles.progressRow}>
                  <CircularProgress value={assessmentPercent} />
                  <View style={styles.progressTextContainer}>
                    <Text style={styles.progressTitle}>Assessment Progress</Text>
                    <Text style={styles.progressSubtext}>
                      Complete your assessments to track your wellbeing journey.
                    </Text>
                    <Text style={styles.progressBreakdown}>
                      {assessmentsCompleted} completed · {inProgress} in progress · {notStarted} not started
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={handleNavigateToAssessments}
                  style={styles.continueButton}
                  activeOpacity={0.8}
                >
                  <Text style={styles.continueButtonText}>Continue Assessment</Text>
                  <Text style={styles.continueButtonArrow}>→</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Actions */}
              <View style={styles.quickActionsCard}>
                <Text style={styles.quickActionsTitle}>Quick Actions</Text>
                <QuickActionItem
                  icon="search"
                  iconBg={palette.red100}
                  iconColor={palette.spartanRed}
                  label="Find a Facilitator"
                  onPress={handleFindFacilitator}
                />
                <QuickActionItem
                  icon="calendar"
                  iconBg={palette.indigo50}
                  iconColor={palette.indigo700}
                  label="Book Appointment"
                  onPress={handleBookAppointment}
                />
                <QuickActionItem
                  icon="clipboard"
                  iconBg={palette.red100}
                  iconColor={palette.spartanRed}
                  label="My Appointments"
                  onPress={handleViewAppointments}
                />
              </View>
            </View>

            {/* Guidance & Counseling Services */}
            <View style={styles.servicesCard}>
              <View style={styles.servicesHeader}>
                <View style={styles.servicesTextContainer}>
                  <Text style={styles.servicesTitle}>Guidance & Counseling Services</Text>
                  <Text style={styles.servicesDescription}>
                    Available through the Office of Guidance and Counseling
                  </Text>
                </View>
                <View style={styles.servicesIconContainer}>
                  <Feather name="heart" size={20} color={palette.spartanRed} />
                </View>
              </View>
              <View style={styles.servicesList}>
                {[
                  { icon: 'message-circle', label: 'E-Counseling', bg: palette.red100, color: palette.spartanRed },
                  { icon: 'share-2', label: 'Referrals', bg: palette.indigo50, color: palette.indigo700 },
                  { icon: 'briefcase', label: 'Career Guidance', bg: palette.amber100, color: palette.amber700 },
                  { icon: 'compass', label: 'Life Guidance', bg: palette.green100, color: palette.success },
                  { icon: 'book-open', label: 'Academic Guidance', bg: palette.red100, color: palette.spartanRed },
                  { icon: 'users', label: 'Peer Support', bg: palette.indigo50, color: palette.indigo700 },
                ].map((service, i) => (
                  <View key={i} style={styles.serviceItem}>
                    <View style={[styles.serviceIconBg, { backgroundColor: service.bg }]}>
                      <Feather name={service.icon as any} size={14} color={service.color} />
                    </View>
                    <Text style={styles.serviceLabel}>{service.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Coming Soon / Roadmap */}
            <View style={styles.comingSoonCard}>
              <View style={styles.comingSoonHeader}>
                <View style={styles.comingSoonTextContainer}>
                  <Text style={styles.comingSoonTitle}>Coming Soon</Text>
                  <Text style={styles.comingSoonDescription}>
                    The {portalName} features are currently under development. More wellness tools are on the way:
                  </Text>
                </View>
                <View style={styles.comingSoonIconContainer}>
                  <Feather name="tool" size={20} color={palette.spartanGold} />
                </View>
              </View>
              <View style={styles.featureList}>
                {[
                  'Weekly wellness trend charts',
                  'Personalized goal setting',
                  'Guided journaling prompts',
                  'Peer support group matching',
                  'Achievement badges & milestones',
                  'Group workshop scheduling',
                ].map((feature, i) => (
                  <View key={i} style={styles.featureItem}>
                    <View style={styles.featureDot} />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

        {/* ─── Facilitator "Coming soon" state ──────────────────── */}
        {role === 'facilitator' && (
          <View style={styles.facilitatorComingSoon}>
            <View style={styles.facilitatorComingSoonIconContainer}>
              <Feather name="tool" size={28} color={palette.spartanGold} />
            </View>
            <Text style={styles.facilitatorComingSoonTitle}>Facilitator Portal</Text>
            <Text style={styles.facilitatorComingSoonDescription}>
              The {portalName} facilitator dashboard is currently under development. You can still access student assessments and manage appointments from the tabs below.
            </Text>
            <View style={styles.facilitatorPlaceholderCard}>
              <Text style={styles.facilitatorPlaceholderText}>
                Full dashboard with student progress tracking, risk alerts, and analytics coming soon.
              </Text>
            </View>
          </View>
        )}

        {/* ─── Footer ──────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} Batangas State University · The National Engineering University
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

interface DashboardScreenProps {
  portalName: string;
}

const screenWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  /* ─── Full-bleed container (maroon background) ──────────── */
  container: {
    flex: 1,
    backgroundColor: palette.spartanRedDark,
  },

  /* ─── Greeting row (on maroon) ──────────────────────────── */
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: palette.spartanRedDark,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationBell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ─── White content sheet ────────────────────────────────── */
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    backgroundColor: palette.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },

  /* ─── Hero Banner ────────────────────────────────────────── */
  heroBanner: {
    backgroundColor: palette.spartanRed,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 0,
  },
  heroQuote: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 6,
  },
  heroAttribution: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },

  /* ─── Loading ────────────────────────────────────────────── */
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },

  /* ─── Disclaimer ─────────────────────────────────────────── */
  disclaimerCard: {
    backgroundColor: lightColors.infoBackground,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  disclaimerIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: palette.indigo50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  disclaimerContent: {
    flex: 1,
  },
  disclaimerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.infoText,
    marginBottom: 3,
  },
  disclaimerText: {
    fontSize: 12,
    color: lightColors.textSecondary,
    lineHeight: 17,
  },

  /* ─── Stat Cards 2x2 Grid ────────────────────────────────── */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: lightColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
  },
  statCaption: {
    fontSize: 11,
    color: lightColors.textMuted,
    marginTop: 1,
  },

  /* ─── Two-column section ─────────────────────────────────── */
  twoColumnSection: {
    gap: 14,
  },

  /* ─── Assessment Progress ────────────────────────────────── */
  progressCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  progressTextContainer: {
    flex: 1,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  progressSubtext: {
    fontSize: 12,
    color: lightColors.textSecondary,
    lineHeight: 16,
    marginBottom: 6,
  },
  progressBreakdown: {
    fontSize: 11,
    color: lightColors.textMuted,
  },
  continueButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  continueButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  continueButtonArrow: {
    fontSize: 16,
    color: '#FFFFFF',
  },

  /* ─── Quick Actions ──────────────────────────────────────── */
  quickActionsCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 12,
  },
  quickActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: lightColors.textSecondary,
  },

  /* ─── Guidance & Counseling Services ────────────────────── */
  servicesCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  servicesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  servicesTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  servicesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  servicesDescription: {
    fontSize: 12,
    color: lightColors.textSecondary,
    lineHeight: 16,
  },
  servicesIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.red100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  servicesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: lightColors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  serviceIconBg: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceLabel: {
    fontSize: 12,
    color: lightColors.textSecondary,
  },

  /* ─── Coming Soon / Roadmap ──────────────────────────────── */
  comingSoonCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  comingSoonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  comingSoonTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  comingSoonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  comingSoonDescription: {
    fontSize: 12,
    color: lightColors.textSecondary,
    lineHeight: 16,
  },
  comingSoonIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.red100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: lightColors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.spartanGold,
  },
  featureText: {
    fontSize: 12,
    color: lightColors.textSecondary,
  },

  /* ─── Facilitator Coming Soon ────────────────────────────── */
  facilitatorComingSoon: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  facilitatorComingSoonIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.amber100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  facilitatorComingSoonIcon: {
    fontSize: 28,
  },
  facilitatorComingSoonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 8,
  },
  facilitatorComingSoonDescription: {
    fontSize: 13,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  facilitatorPlaceholderCard: {
    backgroundColor: lightColors.background,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderStyle: 'dashed',
    width: '100%',
  },
  facilitatorPlaceholderText: {
    fontSize: 12,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  /* ─── Footer ─────────────────────────────────────────────── */
  footer: {
    borderTopWidth: 1,
    borderTopColor: lightColors.border,
    paddingTop: 16,
    marginTop: 8,
  },
  footerText: {
    fontSize: 11,
    color: lightColors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});