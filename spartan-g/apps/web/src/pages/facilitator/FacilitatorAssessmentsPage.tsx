import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Spinner } from "../../components/ui/Spinner";
import type { AssessmentDefinitionDocument } from "@spartan-g/shared-types";

type AssessmentWithId = AssessmentDefinitionDocument & { id: string };

export function FacilitatorAssessmentsPage() {
  const { user } = useAuth();
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

        // Fetch all assessment definitions from the assessments collection
        // Facilitators can read all documents per the Firestore rules
        const { getDocs, query, orderBy, collection } = await import("firebase/firestore");
        const { getFirestoreDb } = await import(
          "@spartan-g/shared-services/src/firebase/firestore"
        );

        const db = getFirestoreDb();
        const q = query(collection(db, "assessments"), orderBy("title", "asc"));
        const snapshot = await getDocs(q);

        if (!cancelled) {
          const items: AssessmentWithId[] = [];
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            // Only include Phase 3B assessment definitions (have courseId)
            if (data.courseId && typeof data.courseId === "string") {
              const { id: _docId, ...rest } = data as unknown as AssessmentDefinitionDocument & { id: string };
              items.push({ id: doc.id, ...rest } as AssessmentWithId);
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
          View the assessments published for students.
        </p>
      </div>

      {assessments.length === 0 ? (
        <EmptyState
          title="No assessments available"
          description="Assessments created by the super admin will appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Course
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Questions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {assessments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {a.title}
                      </div>
                      {a.description && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                          {a.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <Badge variant="neutral">{a.courseId}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {Array.isArray(a.questions) ? a.questions.length : 0}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {a.isPublished ? (
                        <Badge variant="success">Published</Badge>
                      ) : (
                        <Badge variant="neutral">Draft</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}