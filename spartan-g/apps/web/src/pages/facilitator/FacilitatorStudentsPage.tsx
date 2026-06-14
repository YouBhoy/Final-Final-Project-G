import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import { assessmentService, userRepository } from "@spartan-g/shared-services";
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
  isActive: boolean;
}

interface StudentWithRisk extends StudentUser {
  hasAttempts: boolean;
  isCritical: boolean;
  attemptsLoading: boolean;
}

type ViewMode = "list" | "scores";

// ─── Helpers ──────────────────────────────────────────────────

function getPseudonym(studentId: string): string {
  const suffix = studentId.slice(-4);
  return `Student ${suffix}`;
}

function getHiddenEmail(): string {
  return "••••••••@••••••";
}

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

  // Score view state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedStudent, setSelectedStudent] = useState<StudentUser | null>(null);
  const [attempts, setAttempts] = useState<(AssessmentAttemptDocument & { id: string })[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  // Load students on mount
  useEffect(() => {
    if (!user) return;

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
  }, [user]);

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
                map[student.id] = false; // no attempts = not critical
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
    const displayName = selectedStudentIsCritical
      ? selectedStudent.displayName || "Student"
      : getPseudonym(selectedStudent.id);
    const displayEmail = selectedStudentIsCritical
      ? selectedStudent.email
      : getHiddenEmail();

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
        Student identities are pseudonymized to protect privacy. Real names are only shown when a student's assessment scores indicate they may need immediate support.
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Students
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          List of students under your care with assessment scores.
        </p>
      </div>

      {students.length === 0 ? (
        <EmptyState
          title="No active students"
          description="There are no active students enrolled in the system."
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
                  const displayName = student.isCritical
                    ? student.displayName || "Unnamed Student"
                    : getPseudonym(student.id);
                  const displayEmail = student.isCritical
                    ? student.email
                    : getHiddenEmail();

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
                        <Badge variant="success">Active</Badge>
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