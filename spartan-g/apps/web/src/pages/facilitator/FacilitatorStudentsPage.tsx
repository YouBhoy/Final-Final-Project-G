import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { assessmentService } from "@spartan-g/shared-services";
import { getAssignedStudents } from "../../lib/facilitatorAccess";
import { getPublishedAssessmentDefinitions } from "../../lib/assessmentDefinitions";
import { mapDashboardReads } from "../../lib/dashboardData";
import { facilitatorAssessmentParticipation } from "../../lib/dashboardMetrics";
import { AnalyticsBars, AnalyticsDonut } from "../../components/analytics/AnalyticsCharts";
import {
  calculatePHQ9Score,
  calculateGAD7Score,
  calculateDASS21Score,
  type AssessmentAttemptDocument,
} from "@spartan-g/shared-types";
import { Badge } from "../../components/ui/Badge";
import { Card, CardBody } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import type { Timestamp } from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────

interface StudentUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  identityShared: boolean;
}

interface StudentWithRisk extends StudentUser {
  hasAttempts: boolean;
  isCritical: boolean;
  attemptsLoading: boolean;
}

type ViewMode = "list" | "scores";

interface StudentAssessmentComparison {
  id: string;
  label: string;
  completedAssessments: number;
  submittedAttempts: number;
}

interface AssessmentActivity {
  loading: boolean;
  assessmentCount: number | null;
  submittedAttempts: number | null;
  studentsWithSubmissions: number | null;
  comparisons: StudentAssessmentComparison[];
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────

function formatDate(timestamp: Timestamp | undefined): string {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as unknown as string);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
  if (lower.includes("minimal") || lower.includes("normal")) {
    return "bg-green-100 text-green-800";
  }
  if (lower.includes("mild")) {
    return "bg-yellow-100 text-yellow-800";
  }
  if (lower.includes("moderate")) {
    return "bg-orange-100 text-orange-800";
  }
  return "bg-red-100 text-red-800";
}

function isStudentCritical(attempt: AssessmentAttemptDocument & { id: string }): boolean {
  const answers = answersToRecord(attempt);
  const phq = calculatePHQ9Score(answers);
  const gad = calculateGAD7Score(answers);
  const dass = calculateDASS21Score(answers);
  return phq.isCritical || gad.isCritical || dass.isCritical;
}

// ─── Score Card Components ────────────────────────────────────

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
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {isCritical && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
            ⚠ Critical
          </span>
        )}
      </div>

      {subRows ? (
        <div className="space-y-2">
          {subRows.map((row, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-gray-600">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">
                  {row.score} / {row.maxScore}
                </span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getSeverityClass(row.severity)}`}>
                  {row.severity}
                </span>
                {row.isCritical && (
                  <span className="text-xs font-semibold text-red-600">⚠</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <span className="text-lg font-bold text-gray-900">{score}</span>
            <span className="text-sm text-gray-500"> / {maxScore}</span>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getSeverityClass(severity)}`}>
            {severity}
          </span>
        </div>
      )}
    </div>
  );
}

interface AttemptScorePanelProps {
  attempt: AssessmentAttemptDocument & { id: string };
}

function AttemptScorePanel({ attempt }: AttemptScorePanelProps) {
  const answers = answersToRecord(attempt);

  const phqResult = calculatePHQ9Score(answers);
  const gadResult = calculateGAD7Score(answers);
  const dassResult = calculateDASS21Score(answers);

  const isAnyCritical = phqResult.isCritical || gadResult.isCritical || dassResult.isCritical;

  return (
    <div className="space-y-4">
      {isAnyCritical && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>⚠ Critical Score Detected</strong> — This student may need immediate attention
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Attempt #{attempt.attemptNumber}</span>
        <span>Submitted: {formatDate(attempt.submittedAt)}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
              label: "Depression",
              score: dassResult.depression.score,
              maxScore: 42,
              severity: dassResult.depression.severity,
              isCritical: dassResult.depression.isCritical,
            },
            {
              label: "Anxiety",
              score: dassResult.anxiety.score,
              maxScore: 42,
              severity: dassResult.anxiety.severity,
              isCritical: dassResult.anxiety.isCritical,
            },
            {
              label: "Stress",
              score: dassResult.stress.score,
              maxScore: 42,
              severity: dassResult.stress.severity,
              isCritical: dassResult.stress.isCritical,
            },
          ]}
        />
      </div>

    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────

export function FacilitatorStudentsPage() {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pseudonymization: risk status per student (id -> isCritical)
  const [riskMap, setRiskMap] = useState<Record<string, boolean>>({});
  const [riskLoading, setRiskLoading] = useState(true);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [assessmentActivity, setAssessmentActivity] = useState<AssessmentActivity>({
    loading: true, assessmentCount: null, submittedAttempts: null, studentsWithSubmissions: null, comparisons: [], error: null,
  });

  // Score view state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedStudent, setSelectedStudent] = useState<StudentUser | null>(null);
  const [attempts, setAttempts] = useState<(AssessmentAttemptDocument & { id: string })[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  // Load accepted/assigned students; analytics use this same authorized list.
  useEffect(() => {
    if (!user || user.role !== "facilitator") return;

    let cancelled = false;

    async function loadStudents() {
      try {
        setLoading(true);
        setError(null);
        setStudents([]);
        setRiskMap({});
        setAssessmentActivity({ loading: true, assessmentCount: null, submittedAttempts: null, studentsWithSubmissions: null, comparisons: [], error: null });

        const result = await getAssignedStudents(user!.uid);

        if (!cancelled) {
          const items: StudentUser[] = result.map((u) => ({
            id: u.id,
            email: u.email,
            displayName: u.displayName,
            role: u.role,
            identityShared: u.identityShared,
          }));
          setStudents(items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load students");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadStudents();
    return () => {
      cancelled = true;
    };
  }, [user, refreshRevision]);

  // Evaluate risk status for all students
  useEffect(() => {
    if (students.length === 0) {
      setRiskLoading(false);
      setAssessmentActivity({ loading: false, assessmentCount: 0, submittedAttempts: 0, studentsWithSubmissions: 0, comparisons: [], error: null });
      return;
    }

    let cancelled = false;

    async function evaluateRisk() {
      setRiskLoading(true);
      const map: Record<string, boolean> = {};
      setAssessmentActivity({ loading: true, assessmentCount: null, submittedAttempts: null, studentsWithSubmissions: null, comparisons: [], error: null });
      const [catalogueResult, attemptResults] = await Promise.all([
        getPublishedAssessmentDefinitions().then(value => ({ value, error: null as string | null }), () => ({ value: null, error: "Published assessment data is unavailable." })),
        mapDashboardReads(students, async student => {
          try { return { student, attempts: await assessmentService.getAttemptsByStudent(student.id), error: false }; }
          catch { return { student, attempts: [], error: true }; }
        }),
      ]);

      if (cancelled) return;
      const failedReads = attemptResults.filter(result => result.error).length;
      for (const result of attemptResults) {
        if (result.error) { map[result.student.id] = false; continue; }
        map[result.student.id] = result.attempts.length > 0 ? isStudentCritical(result.attempts[0]) : false;
      }
      setRiskMap(map);
      setRiskLoading(false);

      if (catalogueResult.error || failedReads > 0 || !catalogueResult.value) {
        const message = catalogueResult.error ?? `Assessment records are unavailable for ${failedReads} linked ${failedReads === 1 ? "student" : "students"}; no partial comparison is shown.`;
        setAssessmentActivity({ loading: false, assessmentCount: null, submittedAttempts: null, studentsWithSubmissions: null, comparisons: [], error: message });
        return;
      }

      const publishedIds = new Set(catalogueResult.value.map(definition => definition.id));
      const participation = facilitatorAssessmentParticipation(
        students.map(student => student.id),
        [...publishedIds],
        attemptResults.flatMap(({ student, attempts }) => attempts.map(attempt => ({
          studentId: student.id, assessmentId: attempt.assessmentId, status: attempt.status,
        }))),
      );
      const metricsByStudent = new Map(participation.students.map(row => [row.studentId, row]));
      const comparisons = students.map(student => ({
        id: student.id,
        label: student.displayName || "Student",
        completedAssessments: metricsByStudent.get(student.id)?.completedAssessments ?? 0,
        submittedAttempts: metricsByStudent.get(student.id)?.submittedAttempts ?? 0,
      }));
      setAssessmentActivity({
        loading: false,
        assessmentCount: catalogueResult.value.length,
        submittedAttempts: participation.submittedAttempts,
        studentsWithSubmissions: participation.studentsWithSubmissions,
        comparisons,
        error: null,
      });
    }

    evaluateRisk();
    return () => {
      cancelled = true;
    };
  }, [students]);

  const studentsWithRisk = useMemo((): StudentWithRisk[] => {
    return students.map((s) => ({
      ...s,
      hasAttempts: riskMap[s.id] !== undefined,
      isCritical: riskMap[s.id] ?? false,
      attemptsLoading: riskLoading,
    }));
  }, [students, riskMap, riskLoading]);

  const catalogOpportunities = students.length * (assessmentActivity.assessmentCount ?? 0);
  const completedCatalogOpportunities = assessmentActivity.comparisons.reduce((sum, row) => sum + row.completedAssessments, 0);
  const catalogCompletionRate = catalogOpportunities > 0
    ? Math.round(completedCatalogOpportunities / catalogOpportunities * 100)
    : null;

  // Determine if selected student is critical for scores view
  const selectedStudentIsCritical = useMemo((): boolean => {
    if (!selectedStudent) return false;
    return riskMap[selectedStudent.id] ?? false;
  }, [selectedStudent, riskMap]);

  // Load attempts for selected student
  const handleViewScores = useCallback(async (student: StudentUser) => {
    setSelectedStudent(student);
    setViewMode("scores");
    setAttemptsLoading(true);
    setAttemptsError(null);

    try {
      const result = await assessmentService.getAttemptsByStudent(student.id);
      setAttempts(result);
    } catch (err) {
      setAttemptsError(err instanceof Error ? err.message : "Failed to load assessment scores");
    } finally {
      setAttemptsLoading(false);
    }
  }, []);

  const handleBackToList = useCallback(() => {
    setViewMode("list");
    setSelectedStudent(null);
    setAttempts([]);
    setAttemptsError(null);
  }, []);

  // ─── Loading ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading students…" />
      </div>
    );
  }

  // ─── Error ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load students: {error}
      </div>
    );
  }

  // ─── Scores View ─────────────────────────────────────────
  if (viewMode === "scores" && selectedStudent) {
    const displayName = selectedStudent.displayName;
    const displayEmail = selectedStudent.email;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={handleBackToList}
              className="mb-2 inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              ← Back to Students
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                {displayName}
              </h1>
              {selectedStudentIsCritical && (
                <Badge variant="danger">⚠ At Risk</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">{displayEmail}</p>
          </div>
        </div>

        {attemptsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner label="Loading scores…" />
          </div>
        ) : attemptsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {attemptsError}
          </div>
        ) : attempts.length === 0 ? (
          <EmptyState
            title="No assessment data"
            description="This student has not submitted any assessments yet."
          />
        ) : (
          <div className="space-y-6">
            {attempts.map((attempt) => (
              <Card key={attempt.id}>
                <CardBody>
                  <AttemptScorePanel attempt={attempt} />
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── List View ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Pseudonymization notice */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        Student identities stay hidden until the student explicitly requests support and shares their identity with you. Risk scores alone never reveal a name.
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Students
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          List of students under your care with assessment scores.
        </p>
      </div>

      <section aria-labelledby="fac-student-analytics" className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="fac-student-analytics" className="text-lg font-semibold text-gray-900">Assessment participation</h2>
            <p className="mt-1 text-sm text-gray-500">Compares accepted/assigned students against the currently published student assessment catalog.</p>
          </div>
          <Button variant="outline" size="sm" disabled={loading || assessmentActivity.loading} onClick={() => {
            setAssessmentActivity(current => ({ ...current, loading: true, error: null }));
            setRefreshRevision(value => value + 1);
          }}>Refresh analytics</Button>
        </div>
        {assessmentActivity.loading ? <Spinner label="Loading assessment analytics…" /> : assessmentActivity.error ? <p role="alert" className="text-sm text-red-700">{assessmentActivity.error}</p> : <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Linked students", students.length.toLocaleString()],
              ["Published assessments", (assessmentActivity.assessmentCount ?? 0).toLocaleString()],
              ["Submitted attempts", (assessmentActivity.submittedAttempts ?? 0).toLocaleString()],
              ["Students with submissions", `${assessmentActivity.studentsWithSubmissions ?? 0} / ${students.length}`],
              ["Published catalog completion", catalogCompletionRate === null ? "Unavailable" : `${catalogCompletionRate}%`],
            ].map(([label, value]) => <div key={label} className="rounded-lg border border-gray-100 p-3">
              <p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{value}</p>
            </div>)}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-800">Published catalog submissions</h3>
              <AnalyticsDonut title="Linked students by published assessment participation" rows={[
                { label: "At least one completed catalog assessment", value: assessmentActivity.studentsWithSubmissions ?? 0 },
                { label: "No completed catalog assessment found", value: Math.max(0, students.length - (assessmentActivity.studentsWithSubmissions ?? 0)) },
              ]} />
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-800">Completed published assessments per student</h3>
              <AnalyticsBars title="Completed published catalog assessments by linked student" rows={assessmentActivity.comparisons
                .map(row => ({ label: row.label, value: row.completedAssessments, detail: `/ ${assessmentActivity.assessmentCount ?? 0}` }))} />
            </div>
          </div>
          <p className="text-xs text-gray-500">Completion rate divides distinct published assessment definitions with a submitted or graded attempt by the published-catalog opportunities across linked students. The app does not assign due dates or required assessments to facilitator caseloads, so these figures do not label unsubmitted assessments as pending.</p>
        </>}
      </section>

      {students.length === 0 ? (
        <EmptyState
          title="No active students"
          description="Students appear here after you accept their appointment or an administrator assigns them to you."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {studentsWithRisk.map((student) => {
                  const displayName = student.displayName;
                  const displayEmail = student.email;

                  return (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {displayName}
                          </span>
                          {student.isCritical && (
                            <Badge variant="danger">⚠ At Risk</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {displayEmail}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Badge variant={student.identityShared ? 'success' : 'neutral'}>{student.identityShared ? 'Identity shared' : 'Identity hidden'}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewScores(student)}
                        >
                          View Scores
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
