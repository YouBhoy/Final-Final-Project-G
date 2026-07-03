import { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';

interface DashboardScreenProps {
  portalName: string;
}

export function DashboardScreen({ portalName }: DashboardScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const role = session?.role ?? null;
  const displayName = session?.displayName ?? 'User';

  const handleSignOut = useCallback(async () => {
    await signOut();
    // Navigation handled automatically by RootNavigator on session change
  }, [signOut]);

  const handleNavigateToAssessments = useCallback(() => {
    // Navigate to the Assessments tab where the user can pick from active templates
    navigation?.navigate('StudentTabs', { screen: 'StudentAssignments' });
  }, [navigation]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>SG</Text>
          </View>
          <View>
            <Text style={styles.portalTitle}>{portalName}</Text>
            <Text style={styles.portalSubtitle}>Dashboard</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{displayName}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {role === 'student' ? 'Student' : role === 'facilitator' ? 'Facilitator' : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Student-specific content */}
      {role === 'student' && (
        <TouchableOpacity
          onPress={handleNavigateToAssessments}
          style={styles.assessmentCard}
          activeOpacity={0.7}
        >
          <View style={styles.assessmentIconContainer}>
            <Text style={styles.assessmentIcon}>{'\uD83D\uDCDD'}</Text>
          </View>
          <Text style={styles.assessmentTitle}>Assessments</Text>
          <Text style={styles.assessmentDescription}>
            Take your assessments and track your progress.
          </Text>
        </TouchableOpacity>
      )}

      {/* Coming soon placeholder (shown to both roles) */}
      <View style={styles.comingSoonCard}>
        <View style={styles.comingSoonIconContainer}>
          <Text style={styles.comingSoonIcon}>{'\uD83D\uDDC4\uFE0F'}</Text>
        </View>
        <Text style={styles.comingSoonTitle}>Coming Soon</Text>
        <Text style={styles.comingSoonDescription}>
          The {portalName} features are currently under development.
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  portalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.text,
  },
  portalSubtitle: {
    fontSize: 12,
    color: lightColors.textSecondary,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  userInfo: {
    alignItems: 'flex-end',
  },
  userName: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.text,
  },
  roleBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#991B1B',
  },
  signOutButton: {
    borderWidth: 1.5,
    borderColor: lightColors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  signOutText: {
    fontSize: 12,
    fontWeight: '600',
    color: lightColors.primary,
  },
  assessmentCard: {
    borderWidth: 2,
    borderColor: '#DC2626',
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: lightColors.surface,
    padding: 24,
    alignItems: 'center',
  },
  assessmentIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  assessmentIcon: {
    fontSize: 24,
  },
  assessmentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  assessmentDescription: {
    fontSize: 13,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  comingSoonCard: {
    borderWidth: 2,
    borderColor: lightColors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: lightColors.surface,
    padding: 24,
    alignItems: 'center',
  },
  comingSoonIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  comingSoonIcon: {
    fontSize: 24,
  },
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  comingSoonDescription: {
    fontSize: 13,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});