import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, assessmentService, appointmentRepository, notificationRepository } from '@spartan-g/shared-services';
import { lightColors, palette } from '@spartan-g/shared-ui';

const screenWidth = Dimensions.get('window').width;

interface DashboardScreenProps {
  portalName: string;
}

/* ─── Circular Progress Component ─────────────────────────── */
function CircularProgress({ value, size = 80, strokeWidth = 6 }: { value: number; size?: number; strokeWidth?: number }) {
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
      <Text style={{ fontSize: 16, fontWeight: '700', color: lightColors.text }}>
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
    <View style={styles.statCard}>
      <View style={[styles.statIconContainer, { backgroundColor: iconBg }]}>
        <Text style={[styles.statIcon, { color: iconColor }]}>{icon}</Text>
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
        <Text style={[styles.quickActionIconText, { color: iconColor }]}>{icon}</Text>
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

  // Fetch real dashboard data
  useEffect(() => {
    if (!userId || role !== 'student') {
      setIsLoadingData(false);
      return;
    }

    async function loadDashboardData() {
      try {
        // Assessment data
        const myAssessments = await assessmentService.getMyAssessments(userId, 'student');
        const submitted = myAssessments.filter((a) => a.status === 'submitted');
        const inProg = myAssessments.filter((a) => a.status === 'in_progress');
        setAssessmentsCompleted(submitted.length);
        setInProgress(inProg.length);
        setTotalAssessments(myAssessments.length);

        // Not started = total templates minus what they've started
        // For now, we estimate: if they have no assessments at all, show 0/0
        if (myAssessments.length === 0) {
          setTotalAssessments(0);
          setNotStarted(0);
        } else {
          setNotStarted(Math.max(0, myAssessments.length - submitted.length - inProg.length));
        }

        // Next appointment
        const appointments = await appointmentRepository.getByStudent(userId);
        const upcoming = appointments
          .filter((a) => a.status === 'accepted' || a.status === 'requested')
          .sort((a, b) => {
            const aTime = a.scheduledAt?.toDate?.()?.getTime() ?? 0;
            const bTime = b.scheduledAt?.toDate?.()?.getTime() ?? 0;
            return aTime - bTime;
          });
        if (upcoming.length > 0) {
          const next = upcoming[0].scheduledAt?.toDate?.();
          if (next) {
            const now = new Date();
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
        }

        // Unread messages (notifications)
        const unread = await notificationRepository.getUnreadByUserId(userId);
        setUnreadMessages(unread.length);
      } catch {
        // Silently fail — dashboard shows zeros gracefully
      } finally {
        setIsLoadingData(false);
      }
    }

    loadDashboardData();
  }, [userId, role]);

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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ─── Welcome Banner ──────────────────────────────────── */}
      <View style={styles.welcomeBanner}>
        <View style={styles.goldAccent} />
        <View style={styles.bannerContent}>
          <Text style={styles.bannerGreeting}>Welcome back, {firstName}</Text>
          <Text style={styles.bannerTitle}>{portalName}</Text>
          <Text style={styles.bannerQuote}>
            "Leading Innovations, Transforming Lives, Building the Nation."
          </Text>
          <Text style={styles.bannerSubtext}>
            Take a moment for yourself today. Your wellbeing is the foundation of every great achievement.
          </Text>
        </View>
      </View>

      {/* Loading state */}
      {isLoadingData && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={lightColors.primary} />
          <Text style={styles.loadingText}>Loading your dashboard...</Text>
        </View>
      )}

      {/* ─── Student-specific content ─────────────────────────── */}
      {role === 'student' && (
        <>
          {/* Stat Cards Row */}
          <View style={styles.statsRow}>
            <StatCard
              icon="📋"
              iconBg={palette.red100}
              iconColor={palette.spartanRed}
              label="Assessments Completed"
              value={totalAssessments > 0 ? `${assessmentsCompleted}/${totalAssessments}` : '0'}
              caption={totalAssessments - assessmentsCompleted > 0 ? `${totalAssessments - assessmentsCompleted} remaining` : undefined}
            />
            <StatCard
              icon="📅"
              iconBg={palette.amber100}
              iconColor={palette.spartanGold}
              label="Next Appointment"
              value={nextAppointment ?? 'None scheduled'}
            />
            <StatCard
              icon="⏰"
              iconBg={palette.red100}
              iconColor={palette.spartanRed}
              label="Next Check-in"
              value={inProgress > 0 ? `${inProgress} in progress` : 'All done'}
            />
            <StatCard
              icon="💬"
              iconBg={palette.amber100}
              iconColor={palette.spartanGold}
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
                icon="🔍"
                iconBg={palette.red100}
                iconColor={palette.spartanRed}
                label="Find a Facilitator"
                onPress={handleFindFacilitator}
              />
              <QuickActionItem
                icon="📅"
                iconBg={palette.amber100}
                iconColor={palette.spartanGold}
                label="Book Appointment"
                onPress={handleBookAppointment}
              />
              <QuickActionItem
                icon="📋"
                iconBg={palette.red100}
                iconColor={palette.spartanRed}
                label="My Appointments"
                onPress={handleViewAppointments}
              />
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
                <Text style={styles.comingSoonIcon}>🔧</Text>
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
            <Text style={styles.facilitatorComingSoonIcon}>🛠️</Text>
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },

  /* ─── Welcome Banner ─────────────────────────────────────── */
  welcomeBanner: {
    backgroundColor: lightColors.primaryDark,
    borderRadius: 16,
    overflow: 'hidden',
    padding: 20,
    position: 'relative',
  },
  goldAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: palette.spartanGold,
  },
  bannerContent: {
    position: 'relative',
  },
  bannerGreeting: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: palette.spartanGold,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  bannerQuote: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: 4,
  },
  bannerSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 16,
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

  /* ─── Stat Cards ─────────────────────────────────────────── */
  statsRow: {
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
  statIcon: {
    fontSize: 20,
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: lightColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
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
  quickActionIconText: {
    fontSize: 16,
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: '500',
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
    backgroundColor: palette.amber100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comingSoonIcon: {
    fontSize: 20,
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