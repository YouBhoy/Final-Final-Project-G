import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore, userRepository, assessmentService, geminiService } from '@spartan-g/shared-services';
import {
  calculatePHQ9Score,
  calculateGAD7Score,
  calculateDASS21Score,
} from '@spartan-g/shared-types';
import type { AssessmentAttemptDocument } from '@spartan-g/shared-types';
import type { Timestamp } from 'firebase/firestore';
import { lightColors, palette } from '@spartan-g/shared-ui';

// ─── Types ────────────────────────────────────────────────────

interface StudentUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
}

interface StudentWithRisk extends StudentUser {
  hasAttempts: boolean;
  isCritical: boolean;
  attemptsLoading: boolean;
}

type ViewMode = 'list' | 'scores';

// ─── Types ────────────────────────────────────────────────────

interface AiSummaryScores {
  phqScore: number;
  phqSeverity: string;
  gadScore: number;
  gadSeverity: string;
  dassDepressionScore: number;
  dassDepressionSeverity: string;
  dassAnxietyScore: number;
  dassAnxietySeverity: string;
  dassStressScore: number;
  dassStressSeverity: string;
  overallRiskLevel: string;
  overallRiskScore: number;
}

// ─── Helpers ──────────────────────────────────────────────────

function getPseudonym(studentId: string): string {
  const suffix = studentId.slice(-4);
  return `Student ${suffix}`;
}

function getHiddenEmail(): string {
  return '••••••••@••••••';
}

function formatDate(timestamp: Timestamp | undefined): string {
  if (!timestamp) return '—';
  const date = (timestamp as any).toDate ? (timestamp as any).toDate() : new Date(timestamp as unknown as string);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function answersToRecord(attempt: AssessmentAttemptDocument & { id: string }): Record<string, string> {
  return attempt.answers.reduce<Record<string, string>>((acc, a) => {
    acc[a.questionId] = a.value;
    return acc;
  }, {});
}

function getSeverityClass(severity: string): string {
  const lower = severity.toLowerCase();
  if (lower.includes('minimal') || lower.includes('normal')) return 'bg-green-100 text-green-800';
  if (lower.includes('mild')) return 'bg-yellow-100 text-yellow-800';
  if (lower.includes('moderate')) return 'bg-orange-100 text-orange-800';
  return 'bg-red-100 text-red-800';
}

function getSeverityColor(severity: string): string {
  const lower = severity.toLowerCase();
  if (lower.includes('minimal') || lower.includes('normal')) return '#16A34A';
  if (lower.includes('mild')) return '#D97706';
  if (lower.includes('moderate')) return '#EA580C';
  return '#DC2626';
}

function getSeverityBg(severity: string): string {
  const lower = severity.toLowerCase();
  if (lower.includes('minimal') || lower.includes('normal')) return '#DCFCE7';
  if (lower.includes('mild')) return '#FEF3C7';
  if (lower.includes('moderate')) return '#FFEDD5';
  return '#FEE2E2';
}

function isStudentCritical(attempt: AssessmentAttemptDocument & { id: string }): boolean {
  const answers = answersToRecord(attempt);
  const phq = calculatePHQ9Score(answers);
  const gad = calculateGAD7Score(answers);
  const dass = calculateDASS21Score(answers);
  return phq.isCritical || gad.isCritical || dass.isCritical;
}

// ─── Score Card Component ─────────────────────────────────────

interface ScoreCardProps {
  title: string;
  score: number;
  maxScore: number;
  severity: string;
  isCritical: boolean;
  subRows?: { label: string; score: number; maxScore: number; severity: string; isCritical: boolean }[];
}

function ScoreCard({ title, score, maxScore, severity, isCritical, subRows }: ScoreCardProps) {
  return (
    <View style={styles.scoreCard}>
      <View style={styles.scoreCardHeader}>
        <Text style={styles.scoreCardTitle}>{title}</Text>
        {isCritical && (
          <View style={styles.criticalBadge}>
            <Text style={styles.criticalBadgeText}>⚠ Critical</Text>
          </View>
        )}
      </View>

      {subRows ? (
        <View style={styles.subRowsList}>
          {subRows.map((row, i) => (
            <View key={i} style={styles.subRow}>
              <Text style={styles.subRowLabel}>{row.label}</Text>
              <View style={styles.subRowValue}>
                <Text style={styles.subRowScore}>
                  {row.score} / {row.maxScore}
                </Text>
                <View style={[styles.severityPill, { backgroundColor: getSeverityBg(row.severity) }]}>
                  <Text style={[styles.severityPillText, { color: getSeverityColor(row.severity) }]}>
                    {row.severity}
                  </Text>
                </View>
                {row.isCritical && (
                  <Text style={styles.criticalIcon}>⚠</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.scoreRow}>
          <Text style={styles.scoreValue}>
            <Text style={styles.scoreNumber}>{score}</Text>
            <Text style={styles.scoreMax}> / {maxScore}</Text>
          </Text>
          <View style={[styles.severityPill, { backgroundColor: getSeverityBg(severity) }]}>
            <Text style={[styles.severityPillText, { color: getSeverityColor(severity) }]}>
              {severity}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── AI Summary Card Component ────────────────────────────────

function AiSummaryCard({ attempt, scores }: { attempt: AssessmentAttemptDocument & { id: string }; scores: AiSummaryScores }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      // Check cache first
      let text = await geminiService.getCachedSummary(attempt.id);
      if (!text) {
        text = await geminiService.generateSummary(scores);
        if (text) {
          // Cache for future views
          geminiService.cacheSummary(attempt.id, text).catch(() => {});
        }
      }
      if (text) {
        setSummary(text);
      } else {
        setHasError(true);
      }
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [attempt.id, scores]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  if (isLoading) {
    return (
      <View style={styles.aiSummaryCard}>
        <View style={styles.aiSummaryHeader}>
          <Text style={styles.aiSummaryIcon}>🤖</Text>
          <Text style={styles.aiSummaryTitle}>AI-Generated Summary</Text>
        </View>
        <ActivityIndicator size="small" color={lightColors.primary} />
      </View>
    );
  }

  if (hasError && !summary) {
    return (
      <View style={styles.aiSummaryCard}>
        <View style={styles.aiSummaryHeader}>
          <Text style={styles.aiSummaryIcon}>🤖</Text>
          <Text style={styles.aiSummaryTitle}>AI-Generated Summary</Text>
        </View>
        <TouchableOpacity onPress={loadSummary} style={styles.generateButton}>
          <Text style={styles.generateButtonText}>Generate Summary</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.aiSummaryCard}>
      <View style={styles.aiSummaryHeader}>
        <Text style={styles.aiSummaryIcon}>🤖</Text>
        <Text style={styles.aiSummaryTitle}>AI-Generated Summary</Text>
        <TouchableOpacity onPress={loadSummary} style={styles.regenerateButton}>
          <Text style={styles.regenerateButtonText}>Regenerate</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.aiSummaryText}>{summary}</Text>
      <Text style={styles.aiSummaryDisclaimer}>
        This summary is AI-generated and is not a clinical diagnosis. It is a communication aid based on the computed scores above.
      </Text>
    </View>
  );
}

// ─── Attempt Score Panel ──────────────────────────────────────

interface AttemptScorePanelProps {
  attempt: AssessmentAttemptDocument & { id: string };
}

function AttemptScorePanel({ attempt }: AttemptScorePanelProps) {
  const answers = answersToRecord(attempt);

  const phqResult = calculatePHQ9Score(answers);
  const gadResult = calculateGAD7Score(answers);
  const dassResult = calculateDASS21Score(answers);

  const isAnyCritical = phqResult.isCritical || gadResult.isCritical || dassResult.isCritical;

  const aiScores: AiSummaryScores = {
    phqScore: phqResult.score,
    phqSeverity: phqResult.severity,
    gadScore: gadResult.score,
    gadSeverity: gadResult.severity,
    dassDepressionScore: dassResult.depression.score,
    dassDepressionSeverity: dassResult.depression.severity,
    dassAnxietyScore: dassResult.anxiety.score,
    dassAnxietySeverity: dassResult.anxiety.severity,
    dassStressScore: dassResult.stress.score,
    dassStressSeverity: dassResult.stress.severity,
    overallRiskLevel: attempt.overallRiskLevel ?? 'unknown',
    overallRiskScore: attempt.overallRiskScore ?? 0,
  };

  return (
    <View style={styles.attemptPanel}>
      {isAnyCritical && (
        <View style={styles.criticalBanner}>
          <Text style={styles.criticalBannerText}>
            <Text style={{ fontWeight: '700' }}>⚠ Critical Score Detected</Text> — This student may need immediate attention
          </Text>
        </View>
      )}

      <AiSummaryCard attempt={attempt} scores={aiScores} />

      <View style={styles.attemptMeta}>
        <Text style={styles.attemptMetaText}>Attempt #{attempt.attemptNumber}</Text>
        <Text style={styles.attemptMetaText}>Submitted: {formatDate(attempt.submittedAt)}</Text>
      </View>

      <View style={styles.scoresGrid}>
        <ScoreCard
          title="PHQ-9 — Patient Health Questionnaire"
          score={phqResult.score}
          maxScore={27}
          severity={phqResult.severity}
          isCritical={phqResult.isCritical}
        />

        <ScoreCard
          title="GAD-7 — Generalized Anxiety Disorder"
          score={gadResult.score}
          maxScore={21}
          severity={gadResult.severity}
          isCritical={gadResult.isCritical}
        />

        <ScoreCard
          title="DASS-21 — Depression, Anxiety & Stress Scale"
          score={0}
          maxScore={0}
          severity=""
          isCritical={false}
          subRows={[
            {
              label: 'Depression',
              score: dassResult.depression.score,
              maxScore: 42,
              severity: dassResult.depression.severity,
              isCritical: dassResult.depression.isCritical,
            },
            {
              label: 'Anxiety',
              score: dassResult.anxiety.score,
              maxScore: 42,
              severity: dassResult.anxiety.severity,
              isCritical: dassResult.anxiety.isCritical,
            },
            {
              label: 'Stress',
              score: dassResult.stress.score,
              maxScore: 42,
              severity: dassResult.stress.severity,
              isCritical: dassResult.stress.isCritical,
            },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Main Screen Component ────────────────────────────────────

export function FacilitatorStudentsScreen() {
  const session = useAuthStore((s) => s.session);

  const [students, setStudents] = useState<StudentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pseudonymization: risk status per student (id -> isCritical)
  const [riskMap, setRiskMap] = useState<Record<string, boolean>>({});
  const [riskLoading, setRiskLoading] = useState(true);

  // Score view state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedStudent, setSelectedStudent] = useState<StudentUser | null>(null);
  const [attempts, setAttempts] = useState<(AssessmentAttemptDocument & { id: string })[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  // Load students on mount
  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    async function loadStudents() {
      try {
        setLoading(true);
        setError(null);

        const result = await userRepository.getAllStudents();

        if (!cancelled) {
          const items: StudentUser[] = result.map((u) => ({
            id: u.id,
            email: u.email,
            displayName: u.displayName,
            role: u.role,
            isActive: u.isActive,
          }));
          setStudents(items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load students');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStudents();
    return () => { cancelled = true; };
  }, [session]);

  // Evaluate risk status for all students
  useEffect(() => {
    if (students.length === 0) {
      setRiskLoading(false);
      return;
    }

    let cancelled = false;

    async function evaluateRisk() {
      setRiskLoading(true);
      const map: Record<string, boolean> = {};

      await Promise.all(
        students.map(async (student) => {
          try {
            const studentAttempts = await assessmentService.getAttemptsByStudent(student.id);
            if (!cancelled) {
              if (studentAttempts.length > 0) {
                // Use latest attempt to determine criticality
                map[student.id] = isStudentCritical(studentAttempts[0]);
              } else {
                map[student.id] = false;
              }
            }
          } catch {
            if (!cancelled) {
              map[student.id] = false;
            }
          }
        }),
      );

      if (!cancelled) {
        setRiskMap(map);
        setRiskLoading(false);
      }
    }

    evaluateRisk();
    return () => { cancelled = true; };
  }, [students]);

  const studentsWithRisk = useMemo((): StudentWithRisk[] => {
    return students.map((s) => ({
      ...s,
      hasAttempts: riskMap[s.id] !== undefined,
      isCritical: riskMap[s.id] ?? false,
      attemptsLoading: riskLoading,
    }));
  }, [students, riskMap, riskLoading]);

  const selectedStudentIsCritical = useMemo((): boolean => {
    if (!selectedStudent) return false;
    return riskMap[selectedStudent.id] ?? false;
  }, [selectedStudent, riskMap]);

  const handleViewScores = useCallback(async (student: StudentUser) => {
    setSelectedStudent(student);
    setViewMode('scores');
    setAttemptsLoading(true);
    setAttemptsError(null);

    try {
      const result = await assessmentService.getAttemptsByStudent(student.id);
      setAttempts(result);
    } catch (err) {
      setAttemptsError(err instanceof Error ? err.message : 'Failed to load assessment scores');
    } finally {
      setAttemptsLoading(false);
    }
  }, []);

  const handleBackToList = useCallback(() => {
    setViewMode('list');
    setSelectedStudent(null);
    setAttempts([]);
    setAttemptsError(null);
  }, []);

  // ─── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={lightColors.primary} />
        <Text style={styles.loadingText}>Loading students…</Text>
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
        <Text style={styles.errorMessage}>Failed to load students: {error}</Text>
      </View>
    );
  }

  // ─── Scores View ─────────────────────────────────────────
  if (viewMode === 'scores' && selectedStudent) {
    const displayName = selectedStudentIsCritical
      ? selectedStudent.displayName || 'Student'
      : getPseudonym(selectedStudent.id);
    const displayEmail = selectedStudentIsCritical
      ? selectedStudent.email
      : getHiddenEmail();

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View>
          <TouchableOpacity onPress={handleBackToList} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Back to Students</Text>
          </TouchableOpacity>
          <View style={styles.studentHeader}>
            <Text style={styles.studentName}>{displayName}</Text>
            {selectedStudentIsCritical && (
              <View style={styles.atRiskBadge}>
                <Text style={styles.atRiskBadgeText}>⚠ At Risk</Text>
              </View>
            )}
          </View>
          <Text style={styles.studentEmail}>{displayEmail}</Text>
        </View>

        {attemptsLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={lightColors.primary} />
            <Text style={styles.loadingText}>Loading scores…</Text>
          </View>
        ) : attemptsError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{attemptsError}</Text>
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

  // ─── List View ───────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Pseudonymization notice */}
      <View style={styles.privacyNotice}>
        <Text style={styles.privacyNoticeText}>
          Student identities are pseudonymized to protect privacy. Real names are only shown when
          a student's assessment scores indicate they may need immediate support.
        </Text>
      </View>

      <View>
        <Text style={styles.title}>Students</Text>
        <Text style={styles.subtitle}>
          List of students under your care with assessment scores.
        </Text>
      </View>

      {students.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No active students</Text>
          <Text style={styles.emptyDescription}>
            There are no active students enrolled in the system.
          </Text>
        </View>
      ) : (
        <View style={styles.studentList}>
          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.tableHeaderName]}>Name</Text>
            <Text style={[styles.tableHeaderCell, styles.tableHeaderEmail]}>Email</Text>
            <Text style={[styles.tableHeaderCell, styles.tableHeaderStatus]}>Status</Text>
            <Text style={[styles.tableHeaderCell, styles.tableHeaderAction]}>Action</Text>
          </View>

          {studentsWithRisk.map((student) => {
            const displayName = student.isCritical
              ? student.displayName || 'Unnamed Student'
              : getPseudonym(student.id);
            const displayEmail = student.isCritical
              ? student.email
              : getHiddenEmail();

            return (
              <View key={student.id} style={styles.studentRow}>
                <View style={styles.studentNameCell}>
                  <Text style={styles.studentRowName}>{displayName}</Text>
                  {student.isCritical && (
                    <View style={styles.atRiskBadge}>
                      <Text style={styles.atRiskBadgeText}>⚠ At Risk</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.studentRowEmail}>{displayEmail}</Text>
                <View style={styles.statusCell}>
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                </View>
                <View style={styles.actionCell}>
                  <TouchableOpacity
                    onPress={() => handleViewScores(student)}
                    style={styles.viewScoresButton}
                  >
                    <Text style={styles.viewScoresButtonText}>View Scores</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
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
  errorMessage: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
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
  privacyNotice: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 8,
    padding: 12,
  },
  privacyNoticeText: {
    fontSize: 13,
    color: '#3730A3',
    lineHeight: 18,
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
  // List view
  studentList: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '600',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableHeaderName: {
    flex: 2,
  },
  tableHeaderEmail: {
    flex: 2,
  },
  tableHeaderStatus: {
    flex: 1,
  },
  tableHeaderAction: {
    flex: 1,
    textAlign: 'right',
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
  },
  studentNameCell: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studentRowName: {
    fontSize: 14,
    fontWeight: '500',
    color: lightColors.text,
  },
  studentRowEmail: {
    flex: 2,
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  statusCell: {
    flex: 1,
  },
  activeBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16A34A',
  },
  actionCell: {
    flex: 1,
    alignItems: 'flex-end',
  },
  viewScoresButton: {
    borderWidth: 1.5,
    borderColor: lightColors.primary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewScoresButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: lightColors.primary,
  },
  // Scores view
  backLink: {
    marginBottom: 8,
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.primary,
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  studentName: {
    fontSize: 22,
    fontWeight: '700',
    color: lightColors.text,
  },
  studentEmail: {
    fontSize: 14,
    color: lightColors.textSecondary,
    marginTop: 2,
  },
  atRiskBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  atRiskBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#991B1B',
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
  // Score panel
  attemptPanel: {
    gap: 12,
  },
  criticalBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
  },
  criticalBannerText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },
  attemptMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  attemptMetaText: {
    fontSize: 12,
    color: lightColors.textMuted,
  },
  scoresGrid: {
    gap: 12,
  },
  // Score card
  scoreCard: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    backgroundColor: lightColors.surface,
    padding: 12,
  },
  scoreCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  scoreCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.text,
    flex: 1,
    marginRight: 8,
  },
  criticalBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  criticalBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#991B1B',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreValue: {},
  scoreNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.text,
  },
  scoreMax: {
    fontSize: 14,
    color: lightColors.textMuted,
  },
  severityPill: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  severityPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  subRowsList: {
    gap: 8,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subRowLabel: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  subRowValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subRowScore: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.text,
  },
  criticalIcon: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '700',
  },
  // AI Summary card
  aiSummaryCard: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  aiSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiSummaryIcon: {
    fontSize: 18,
  },
  aiSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6D28D9',
    flex: 1,
  },
  aiSummaryText: {
    fontSize: 14,
    color: '#4C1D95',
    lineHeight: 20,
  },
  aiSummaryDisclaimer: {
    fontSize: 11,
    color: '#8B5CF6',
    fontStyle: 'italic',
    lineHeight: 15,
  },
  generateButton: {
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  generateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D28D9',
  },
  regenerateButton: {
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  regenerateButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6D28D9',
  },
});
