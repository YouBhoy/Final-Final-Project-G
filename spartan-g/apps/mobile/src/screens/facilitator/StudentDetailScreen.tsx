import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { FacilitatorMobileStackParamList } from '@spartan-g/shared-types';
import { useAuthStore, assessmentService, assessmentOverrideService } from '@spartan-g/shared-services';
import type { AssessmentAttemptDocument } from '@spartan-g/shared-types';
import { lightColors, palette } from '@spartan-g/shared-ui';
import { Feather } from '@expo/vector-icons';
import { AttemptScorePanel } from './FacilitatorStudentsScreen';

type Props = NativeStackScreenProps<FacilitatorMobileStackParamList, 'StudentDetail'>;

export function StudentDetailScreen({ route, navigation }: Props) {
  const { assessmentId, studentId } = route.params;
  const session = useAuthStore((s) => s.session);

  // ─── Override section state ────────────────────────────────
  const [studentName, setStudentName] = useState('Student');
  const [assessmentTitle, setAssessmentTitle] = useState('Assessment');
  const [attemptCount, setAttemptCount] = useState(0);
  const [defaultMaxAttempts, setDefaultMaxAttempts] = useState(1);
  const [overrideValue, setOverrideValue] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // ─── Scores section state ──────────────────────────────────
  const [attempts, setAttempts] = useState<(AssessmentAttemptDocument & { id: string })[]>([]);
  const [scoresLoading, setScoresLoading] = useState(true);
  const [scoresError, setScoresError] = useState<string | null>(null);

  // ─── General loading ───────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all data on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        // ── Override data ──
        const assessment = await assessmentService.getAssessmentDefinition(assessmentId);
        if (assessment && !cancelled) {
          setAssessmentTitle(assessment.title);
          setDefaultMaxAttempts(assessment.maxAttempts);
          setOverrideValue(assessment.maxAttempts);
        }

        const count = await assessmentService.getAttemptCount(assessmentId, studentId);
        if (!cancelled) setAttemptCount(count);

        const existingOverride = await assessmentOverrideService.getOverride(assessmentId, studentId);
        if (existingOverride && !cancelled) {
          setOverrideValue(existingOverride.maxAttemptsOverride);
          setReason(existingOverride.reason ?? '');
        }

        // ── Scores data ──
        const studentAttempts = await assessmentService.getAttemptsByStudent(studentId);
        if (!cancelled) {
          setAttempts(studentAttempts);
          if (studentAttempts.length > 0) {
            setStudentName(`Student ${studentId.slice(-4)}`);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setScoresLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [assessmentId, studentId]);

  // ─── Stepper handlers ──────────────────────────────────────
  const increment = useCallback(() => {
    setOverrideValue((prev) => Math.min(10, prev + 1));
  }, []);

  const decrement = useCallback(() => {
    setOverrideValue((prev) => Math.max(Math.max(1, attemptCount), prev - 1));
  }, [attemptCount]);

  const handleSave = useCallback(async () => {
    if (!session) return;

    if (overrideValue < attemptCount) {
      Alert.alert(
        'Invalid Value',
        `The student has already used ${attemptCount} attempt${attemptCount !== 1 ? 's' : ''}. The override must allow at least ${attemptCount}.`,
      );
      return;
    }

    try {
      setIsSaving(true);
      await assessmentOverrideService.saveOverride(
        assessmentId,
        studentId,
        overrideValue,
        session.uid,
        reason.trim() || undefined,
      );

      Alert.alert(
        'Override Saved',
        `Student will be allowed up to ${overrideValue} attempt${overrideValue !== 1 ? 's' : ''}. This takes effect immediately.`,
      );
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save override');
    } finally {
      setIsSaving(false);
    }
  }, [session, overrideValue, attemptCount, assessmentId, studentId, reason]);

  // ─── Loading ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading student data...</Text>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentEffectiveMax = Math.max(defaultMaxAttempts, overrideValue);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ─── Student Header ──────────────────────────────────── */}
      <View style={styles.studentHeader}>
        <View style={styles.studentAvatar}>
          <Text style={styles.studentAvatarText}>
            {studentName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.studentHeaderInfo}>
          <Text style={styles.studentHeaderName}>{studentName}</Text>
          <Text style={styles.studentHeaderAssessment}>{assessmentTitle}</Text>
        </View>
      </View>

      {/* ════════════════════════════════════════════════════════ */}
      {/* SECTION 1: Adjust Attempts                             */}
      {/* ════════════════════════════════════════════════════════ */}
      <View style={styles.sectionHeader}>
        <Feather name="sliders" size={18} color={lightColors.primary} />
        <Text style={styles.sectionTitle}>Adjust Attempts</Text>
      </View>

      {/* Current stats card */}
      <View style={styles.statsCard}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Attempts Used</Text>
          <Text style={styles.statValue}>{attemptCount}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Default Max</Text>
          <Text style={styles.statValue}>{defaultMaxAttempts}</Text>
        </View>
        {overrideValue !== defaultMaxAttempts && (
          <>
            <View style={styles.statDivider} />
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: lightColors.warningText }]}>Override Max</Text>
              <Text style={[styles.statValue, { color: lightColors.warningText }]}>{overrideValue}</Text>
            </View>
          </>
        )}
      </View>

      {/* Stepper card */}
      <View style={styles.stepperCard}>
        <Text style={styles.stepperTitle}>Allowed Attempts</Text>
        <Text style={styles.stepperSubtitle}>
          Set the maximum number of attempts this student is allowed.
        </Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            onPress={decrement}
            style={[styles.stepperButton, overrideValue <= Math.max(1, attemptCount) && styles.stepperButtonDisabled]}
            disabled={overrideValue <= Math.max(1, attemptCount)}
            activeOpacity={0.7}
          >
            <Feather
              name="minus"
              size={28}
              color={overrideValue <= Math.max(1, attemptCount) ? lightColors.textMuted : '#FFFFFF'}
            />
          </TouchableOpacity>
          <View style={styles.stepperValueContainer}>
            <Text style={styles.stepperValue}>{overrideValue}</Text>
          </View>
          <TouchableOpacity
            onPress={increment}
            style={[styles.stepperButton, overrideValue >= 10 && styles.stepperButtonDisabled]}
            disabled={overrideValue >= 10}
            activeOpacity={0.7}
          >
            <Feather
              name="plus"
              size={28}
              color={overrideValue >= 10 ? lightColors.textMuted : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
        {overrideValue < attemptCount && (
          <Text style={styles.warningText}>
            Must be at least {attemptCount} to allow existing attempts.
          </Text>
        )}
      </View>

      {/* Reason field */}
      <View style={styles.reasonCard}>
        <Text style={styles.reasonLabel}>Reason (optional)</Text>
        <TextInput
          style={styles.reasonInput}
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Technical issue during assessment"
          placeholderTextColor={lightColors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      {/* Save button */}
      <TouchableOpacity
        onPress={handleSave}
        style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Feather name="check-circle" size={20} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>Save Override</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Info note */}
      <View style={styles.infoCard}>
        <Feather name="info" size={16} color={lightColors.info} />
        <Text style={styles.infoText}>
          Changes take effect immediately. Students will be able to retry up to the new limit.
        </Text>
      </View>

      {/* ════════════════════════════════════════════════════════ */}
      {/* SECTION 2: Assessment Results                           */}
      {/* ════════════════════════════════════════════════════════ */}
      <View style={styles.sectionDivider} />

      <View style={styles.sectionHeader}>
        <Feather name="clipboard" size={18} color={lightColors.primary} />
        <Text style={styles.sectionTitle}>Assessment Results</Text>
      </View>

      {scoresLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="small" color={lightColors.primary} />
        </View>
      ) : scoresError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{scoresError}</Text>
        </View>
      ) : attempts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No assessment data</Text>
          <Text style={styles.emptyDescription}>
            This student has not submitted any assessments yet.
          </Text>
        </View>
      ) : (
        <View style={styles.attemptsList}>
          {attempts.map((attempt) => (
            <View key={attempt.id} style={styles.attemptCard}>
              <AttemptScorePanel attempt={attempt} />
            </View>
          ))}
        </View>
      )}
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
  backButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Student header
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  studentAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  studentHeaderInfo: {
    flex: 1,
  },
  studentHeaderName: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
  },
  studentHeaderAssessment: {
    fontSize: 13,
    color: lightColors.textSecondary,
    marginTop: 2,
  },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: lightColors.border,
    marginVertical: 4,
  },
  // Stats card
  statsCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: lightColors.textSecondary,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
  },
  statDivider: {
    height: 1,
    backgroundColor: lightColors.border,
  },
  // Stepper
  stepperCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  stepperTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  stepperSubtitle: {
    fontSize: 12,
    color: lightColors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 16,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    backgroundColor: lightColors.border,
  },
  stepperValueContainer: {
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 36,
    fontWeight: '700',
    color: lightColors.text,
  },
  warningText: {
    fontSize: 12,
    color: lightColors.error,
    marginTop: 8,
  },
  // Reason
  reasonCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: 8,
  },
  reasonInput: {
    backgroundColor: lightColors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: lightColors.border,
    padding: 14,
    fontSize: 14,
    color: lightColors.text,
    minHeight: 80,
  },
  // Save
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.spartanRed,
    borderRadius: 14,
    paddingVertical: 18,
    gap: 8,
    minHeight: 60,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Info
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: lightColors.infoBackground,
    borderRadius: 10,
    padding: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: lightColors.infoText,
    lineHeight: 16,
  },
  // Scores section
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#B91C1C',
  },
  emptyCard: {
    borderWidth: 2,
    borderColor: lightColors.border,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: lightColors.surface,
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  emptyDescription: {
    fontSize: 13,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  attemptsList: {
    gap: 16,
  },
  attemptCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
});