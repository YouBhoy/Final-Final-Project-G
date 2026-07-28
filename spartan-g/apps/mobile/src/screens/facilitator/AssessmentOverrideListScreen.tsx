import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FacilitatorMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, userRepository, assessmentService } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';
import { Feather } from '@expo/vector-icons';

interface StudentWithAttempts {
  id: string;
  displayName: string;
  email: string;
  attemptCount: number;
  assessmentId: string;
  assessmentTitle: string;
}

export function AssessmentOverrideListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FacilitatorMobileStackParamList>>();
  const session = useAuthStore((s) => s.session);

  const [students, setStudents] = useState<StudentWithAttempts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    if (!session) return;
    try {
      setIsLoading(true);
      setError(null);

      // Get all students linked to this facilitator
      const allUsers = await userRepository.getAll();
      const studentsList = allUsers.filter((u) => u.role === 'student' && u.isActive);

      // For each student, get their assessment attempts
      const studentData: StudentWithAttempts[] = [];
      for (const student of studentsList) {
        let attempts: any[] = [];
        try {
          attempts = await assessmentService.getAttemptsByStudent(student.id);
        } catch (err: any) {
          console.error('[AssessmentOverrideList] getAttemptsByStudent failed for', student.id, err);
          // If it's still an index error, surface a clearer message
          if (err?.message?.includes('requires an index')) {
            setError('Firestore index is still building. Please wait a few minutes and try again.');
            return;
          }
          throw err;
        }
        if (attempts.length > 0) {
          // Group by assessmentId, take the most recent one for display
          const assessmentMap = new Map<string, { count: number; title: string }>();
          for (const attempt of attempts) {
            const existing = assessmentMap.get(attempt.assessmentId);
            if (existing) {
              existing.count += 1;
            } else {
              // Try to get assessment title
              let title = 'Assessment';
              try {
                const def = await assessmentService.getAssessmentDefinition(attempt.assessmentId);
                if (def) title = def.title;
              } catch {
                // Fallback
              }
              assessmentMap.set(attempt.assessmentId, { count: 1, title });
            }
          }

          // Take the first assessment for display
          const firstEntry = assessmentMap.entries().next().value;
          if (firstEntry) {
            const [assessmentId, data] = firstEntry;
            studentData.push({
              id: student.id,
              displayName: student.displayName || `Student ${student.id.slice(-4)}`,
              email: student.email || '',
              attemptCount: attempts.length,
              assessmentId,
              assessmentTitle: data.title,
            });
          }
        }
      }

      setStudents(studentData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleStudentPress = useCallback(
    (studentId: string, assessmentId: string) => {
      navigation.navigate('StudentDetail', { studentId, assessmentId });
    },
    [navigation],
  );

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading students...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity onPress={loadStudents} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Feather name="sliders" size={22} color={lightColors.primary} />
        <Text style={styles.headerTitle}>Attempt Overrides</Text>
      </View>
      <Text style={styles.headerSubtitle}>
        Tap a student to adjust their allowed assessment attempts.
      </Text>

      {/* Students list */}
      {students.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="users" size={40} color={lightColors.textMuted} />
          <Text style={styles.emptyTitle}>No Students Found</Text>
          <Text style={styles.emptyMessage}>
            Students who have taken assessments will appear here.
          </Text>
        </View>
      ) : (
        students.map((student) => (
          <TouchableOpacity
            key={student.id}
            style={styles.studentCard}
            onPress={() => handleStudentPress(student.id, student.assessmentId)}
            activeOpacity={0.7}
          >
            <View style={styles.studentAvatar}>
              <Text style={styles.studentAvatarText}>
                {student.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.studentInfo}>
              <Text style={styles.studentName}>{student.displayName}</Text>
              <Text style={styles.studentDetail}>
                {student.assessmentTitle} · {student.attemptCount} attempt{student.attemptCount !== 1 ? 's' : ''}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={lightColors.textMuted} />
          </TouchableOpacity>
        ))
      )}

      {/* Pull to refresh hint */}
      <TouchableOpacity onPress={loadStudents} style={styles.refreshButton}>
        <Feather name="refresh-cw" size={16} color={lightColors.primary} />
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>
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
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: lightColors.background,
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 8,
  },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIconText: {
    fontSize: 28,
    fontWeight: '700',
    color: lightColors.error,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: lightColors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: lightColors.textSecondary,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
    marginTop: 8,
  },
  emptyMessage: {
    fontSize: 13,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  studentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: 2,
  },
  studentDetail: {
    fontSize: 12,
    color: lightColors.textSecondary,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  refreshText: {
    fontSize: 14,
    color: lightColors.primary,
    fontWeight: '600',
  },
});