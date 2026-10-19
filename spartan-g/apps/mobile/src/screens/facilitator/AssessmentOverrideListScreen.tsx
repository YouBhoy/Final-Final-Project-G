import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useAuthStore, facilitatorStudentsService, facilitatorStudentsErrorMessage } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';
import { Feather } from '@expo/vector-icons';

interface StudentWithAttempts {
  id: string;
  displayName: string;
  email: string;
  attemptCount: number;
  assessmentId: string | null;
  assessmentTitle: string;
  historyUnavailable?: boolean;
}

export function AssessmentOverrideListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<FacilitatorMobileStackParamList>>();
  const session = useAuthStore((s) => s.session);
  const authStatus = useAuthStore(s => s.status);
  const [dataOwner, setDataOwner] = useState<typeof session>(null);
  const requestRef = useRef(0);

  const [students, setStudents] = useState<StudentWithAttempts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStudents = useCallback(async () => {
    const request = ++requestRef.current;
    const current = () => requestRef.current === request && useAuthStore.getState().session === session;
    setIsLoading(true); setError(null); setNotice(null); setDataOwner(null); setStudents([]);
    try {
      if (!session || authStatus !== 'authenticated') throw new Error('Staff permission required');
      const assigned = await facilitatorStudentsService.listStudents();
      if (!current()) return;
      if (assigned.unavailableCount) setNotice('Some accepted links are unavailable or inactive. No wider student search was made.');
      const studentData: StudentWithAttempts[] = [];
      for (const student of assigned.students) {
        const row = { id: student.id, displayName: student.displayName || 'Student', email: student.email };
        try {
          const history = await facilitatorStudentsService.getStudentHistory(student.id);
          if (!current()) return;
          const assessmentIds = [...new Set(history.attempts.map(attempt => attempt.assessmentId))];
          if (!assessmentIds.length) studentData.push({ ...row, attemptCount: 0, assessmentId: null, assessmentTitle: 'No submitted or graded assessment history' });
          for (const assessmentId of assessmentIds) studentData.push({
            ...row, attemptCount: history.attempts.filter(attempt => attempt.assessmentId === assessmentId).length,
            assessmentId, assessmentTitle: history.metadata[assessmentId]?.title || 'Assessment name unavailable',
          });
        } catch {
          if (!current()) return;
          studentData.push({ ...row, attemptCount: 0, assessmentId: null, assessmentTitle: 'Assessment history unavailable. Open to retry authorized access.', historyUnavailable: true });
        }
      }
      if (current()) setStudents(studentData);
    } catch (err) { if (current()) setError(facilitatorStudentsErrorMessage(err)); }
    finally { if (current()) { setDataOwner(session); setIsLoading(false); } }
  }, [session, authStatus]);

  useEffect(() => { void loadStudents(); return () => { requestRef.current++; }; }, [loadStudents]);

  const handleStudentPress = useCallback(
    (studentId: string, assessmentId: string | null) => {
      if (assessmentId) navigation.navigate('StudentDetail', { studentId, assessmentId });
      else navigation.navigate('FacilitatorStudentsList', { studentId });
    },
    [navigation],
  );

  if (authStatus !== 'authenticated' || !session || !['facilitator', 'super_admin'].includes(session.role)) return <View style={styles.centerContainer}><Text>Sign in with an authorized staff account to view assigned students.</Text></View>;
  if (dataOwner !== session || isLoading) {
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
        <Text style={styles.headerTitle}>Students</Text>
      </View>
      <Text style={styles.headerSubtitle}>
        View assigned students and their authorized assessment records. Attempt-limit changes require an administrator.
      </Text>
      {notice && <Text style={styles.errorMessage}>{notice}</Text>}

      {/* Students list */}
      {students.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="users" size={40} color={lightColors.textMuted} />
          <Text style={styles.emptyTitle}>No assigned active students</Text>
          <Text style={styles.emptyMessage}>
            An accepted facilitator-student assignment is required. Ask an administrator to review a missing relationship.
          </Text>
        </View>
      ) : (
        students.map((student) => (
          <TouchableOpacity
            key={student.id + '_' + student.assessmentId}
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
                {student.assessmentTitle}{student.assessmentId ? ` · ${student.attemptCount} attempt${student.attemptCount !== 1 ? 's' : ''}` : ''}
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
