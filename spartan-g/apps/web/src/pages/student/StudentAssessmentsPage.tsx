import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Spinner } from "../../components/ui/Spinner";
import type { AssessmentDefinitionDocument } from "@spartan-g/shared-types";

type AssessmentWithId = AssessmentDefinitionDocument & { id: string };

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

        const { getDocs, query, orderBy, collection, where } = await import("firebase/firestore");
        const { getFirestoreDb } = await import(
          "@spartan-g/shared-services/src/firebase/firestore"
        );

        const db = getFirestoreDb();
        const q = query(
          collection(db, "assessments"),
          where("isPublished", "==", true),
          orderBy("title", "asc"),
        );
        const snapshot = await getDocs(q);

        if (!cancelled) {
          const items: AssessmentWithId[] = [];
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            if (data.courseId && typeof data.courseId === "string") {
              items.push({ id: doc.id, ...data } as unknown as AssessmentWithId);
            }
          });
          setAssessments(items);
        }
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
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load assessments: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Assessments
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Take your check-in assessments to track your wellbeing.
        </p>
      </div>

      {assessments.length === 0 ? (
        <EmptyState
          title="No assessments available"
          description="Check-in assessments will appear here when your facilitators publish them."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assessments.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <div className="flex-1 px-6 py-5">
                <div className="flex items-start justify-between">
                  <Badge variant="info">{a.courseId}</Badge>
                  <span className="text-xs text-gray-500">
                    {a.questions?.length ?? 0} {a.questions?.length === 1 ? "question" : "questions"}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-gray-900">{a.title}</h3>
                {a.description && (
                  <p className="mt-1 line-clamp-3 text-sm text-gray-500">{a.description}</p>
                )}
                {a.maxAttempts > 0 && (
                  <p className="mt-2 text-xs text-gray-400">
                    Max {a.maxAttempts} {a.maxAttempts === 1 ? "attempt" : "attempts"}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-3">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate(`/student/assessment/${a.id}`)}
                >
                  Start assessment
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}