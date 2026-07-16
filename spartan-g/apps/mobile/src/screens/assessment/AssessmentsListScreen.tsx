import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentMobileStackParamList } from '@spartan-g/shared-types';
import type { AssessmentDefinitionDocument } from '@spartan-g/shared-types';
import { assessmentRepository, assessmentService, useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';

type AssessmentDefWithId = AssessmentDefinitionDocument & { id: string };

export function AssessmentsListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StudentMobileStackParamList>>();
  const session = useAuthStore((s) => s.session);

  const [assessments, setAssessments] = useState<AssessmentDefWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail modal state
  const [selectedAssessment, setSelectedAssessment] = useState<AssessmentDefWithId | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Use real-time listener (onSnapshot) matching web's approach
    const unsubscribe = assessmentRepository.subscribePublished(
      (data) => {
        setAssessments(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message || 'Failed to load assessments');
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!selectedAssessment || !session) return;

    setStarting(true);
    setStartError(null);

    try {
      // Phase 3B: start an attempt on the assessment definition
      const attemptId = await assessmentService.startAttempt(
        selectedAssessment.id,
        session.uid,
      );
      setSelectedAssessment(null);
      // Navigate to the assessment-taking screen with the attempt ID
      navigation.navigate('AssessmentWizard', { assessmentId: attemptId });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start assessment');
    } finally {
      setStarting(false);
    }
  }, [selectedAssessment, session, navigation]);

  // ─── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading assessments…</Text>
      </View>
    );
  }

  // ─── Error ───────────────────────────────────────────────
  if (error) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>!</Text>
        </View>
        <Text style={styles.errorTitle}>Failed to Load</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View>
        <Text style={styles.title}>Assessments</Text>
        <Text style={styles.subtitle}>
          Check-in questionnaires published by your facilitators.
        </Text>
      </View>

      {/* Empty state */}
      {assessments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>{'\uD83D\uDCDD'}</Text>
          <Text style={styles.emptyTitle}>No assessments available</Text>
          <Text style={styles.emptyDescription}>
            New check-ins will appear here when your facilitators publish them.
          </Text>
        </View>
      ) : (
        /* Assessment list */
        <View style={styles.list}>
          {assessments.map((a) => (
            <TouchableOpacity
              key={a.id}
              style={styles.templateCard}
              onPress={() => {
                setStartError(null);
                setSelectedAssessment(a);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.templateHeader}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>
                    {a.questions?.length ?? 0} questions
                  </Text>
                </View>
              </View>
              <Text style={styles.templateTitle}>{a.title}</Text>
              {a.description && (
                <Text style={styles.templateDescription} numberOfLines={3}>
                  {a.description}
                </Text>
              )}
              <View style={styles.templateFooter}>
                <Text style={styles.viewDetailsText}>View details</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Detail Modal */}
      <Modal
        visible={!!selectedAssessment}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAssessment(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedAssessment && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalCategoryBadge}>
                    <Text style={styles.modalCategoryBadgeText}>
                      {selectedAssessment.questions?.length ?? 0} questions
                    </Text>
                  </View>
                </View>

                <Text style={styles.modalTitle}>{selectedAssessment.title}</Text>

                {selectedAssessment.description && (
                  <Text style={styles.modalDescription}>{selectedAssessment.description}</Text>
                )}

                {selectedAssessment.instructions && (
                  <View style={styles.instructionsBox}>
                    <Text style={styles.instructionsLabel}>Instructions</Text>
                    <Text style={styles.instructionsText}>{selectedAssessment.instructions}</Text>
                  </View>
                )}

                {startError && (
                  <View style={styles.modalError}>
                    <Text style={styles.modalErrorText}>{startError}</Text>
                  </View>
                )}

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={() => setSelectedAssessment(null)}
                    style={styles.modalCancelButton}
                    disabled={starting}
                  >
                    <Text style={styles.modalCancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleStart}
                    style={[styles.modalStartButton, starting && styles.modalStartButtonDisabled]}
                    disabled={starting}
                    activeOpacity={0.8}
                  >
                    {starting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.modalStartText}>Start assessment</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: lightColors.text,
  },
  subtitle: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 4,
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
  emptyIcon: {
    fontSize: 32,
    marginBottom: 12,
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
  list: {
    gap: 12,
  },
  templateCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
  },
  questionCount: {
    fontSize: 12,
    color: lightColors.textSecondary,
  },
  templateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  templateDescription: {
    fontSize: 13,
    color: lightColors.textSecondary,
    lineHeight: 18,
  },
  templateFooter: {
    marginTop: 10,
    alignItems: 'flex-end',
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.primary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalCategoryBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modalCategoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
  },
  modalQuestionCount: {
    fontSize: 12,
    color: lightColors.textSecondary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: lightColors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  instructionsBox: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  instructionsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4338CA',
    marginBottom: 4,
  },
  instructionsText: {
    fontSize: 13,
    color: '#3730A3',
    lineHeight: 18,
  },
  modalError: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  modalErrorText: {
    fontSize: 13,
    color: '#B91C1C',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelButton: {
    borderWidth: 1.5,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.textSecondary,
  },
  modalStartButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalStartButtonDisabled: {
    opacity: 0.6,
  },
  modalStartText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});