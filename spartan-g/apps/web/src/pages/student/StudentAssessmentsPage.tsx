import { getPublishedAssessmentDefinitions, type PublishedAssessment } from '../../lib/assessmentDefinitions';
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Spinner } from "../../components/ui/Spinner";
type AssessmentWithId = PublishedAssessment;

// The stored courseId is an internal key (e.g. "mental-health-screening"); show a readable label instead.
function categoryLabel(courseId: string) {
  if (/screening|mental|wellbeing|well-being/i.test(courseId)) return "Wellbeing assessment";
  const words = courseId.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StudentAssessmentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState<AssessmentWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const items = await getPublishedAssessmentDefinitions();
        if (!cancelled) setAssessments(items);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load assessments"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading assessments…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1100px] rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
        Failed to load assessments: {error}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
          Assessments
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Take your check-in assessments to track your wellbeing.
        </p>
      </div>

      {assessments.length === 0 ? (
        <EmptyState
          title="No assessments available"
          description="Check-in assessments will appear here when your facilitators publish them."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {assessments.map((a) => {
            const questionCount = a.questionCount;
            return (
              <Card key={a.id} className="flex flex-col">
                <div className="flex-1 px-6 py-5">
                  <Badge variant="info">{categoryLabel(a.courseId)}</Badge>
                  <h3 className="mt-3 text-lg font-semibold text-[var(--color-text)]">{a.title}</h3>
                  {a.description && (
                    <p className="mt-1 line-clamp-3 text-sm text-[var(--color-text-secondary)]">{a.description}</p>
                  )}

                  {/* Metadata */}
                  <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                    <div className="flex gap-1.5">
                      <dt className="text-[var(--color-text-muted)]">Questions</dt>
                      <dd className="font-medium text-[var(--color-text)]">{questionCount}</dd>
                    </div>
                    {a.maxAttempts > 0 && (
                      <div className="flex gap-1.5">
                        <dt className="text-[var(--color-text-muted)]">Attempts allowed</dt>
                        <dd className="font-medium text-[var(--color-text)]">{a.maxAttempts}</dd>
                      </div>
                    )}
                  </dl>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-6 py-3">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => navigate(`/student/assessment/${a.id}`)}
                  >
                    Start assessment
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
