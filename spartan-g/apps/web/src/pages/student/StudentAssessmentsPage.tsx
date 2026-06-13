import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveAssessmentTemplates, type TemplateWithId } from "../../hooks/useAssessmentTemplates";
import { useAssessmentQuestions } from "../../hooks/useAssessmentQuestions";
import { useAuth } from "../../hooks/useAuth";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { startAssessment } from "../../lib/assessments";
import { getErrorMessage } from "@spartan-g/shared-types";

const QUESTION_TYPE_LABEL: Record<string, string> = {
  short_text: "Short text",
  long_text: "Long text",
  single_choice: "Single choice",
  multi_choice: "Multi choice",
  scale_1_5: "Scale 1–5",
  scale_1_10: "Scale 1–10",
  yes_no: "Yes / No",
};

export function StudentAssessmentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, loading, error } = useActiveAssessmentTemplates();
  const [selected, setSelected] = useState<TemplateWithId | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    if (!selected || !user) return;
    setBusy(true);
    setActionError(null);
    try {
      const assessmentId = await startAssessment(selected.id, user.uid, user.role);
      setSelected(null);
      // Navigate to the answer-taking wizard
      navigate(`/student/assessment/${assessmentId}`);
    } catch (e) {
      setActionError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [selected, user, navigate]);

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
        Failed to load assessments: {error.message}
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
          Check-in questionnaires published by your facilitators.
        </p>
      </div>

      {data.length === 0 ? (
        <EmptyState
          title="No assessments available"
          description="New check-ins will appear here when your facilitators publish them."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <div className="flex-1 px-6 py-5">
                <div className="flex items-start justify-between">
                  <Badge variant="info">{t.category}</Badge>
                  <span className="text-xs text-gray-500">
                    {t.questionCount} {t.questionCount === 1 ? "question" : "questions"}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-gray-900">{t.title}</h3>
                {t.description && (
                  <p className="mt-1 line-clamp-3 text-sm text-gray-500">{t.description}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setActionError(null);
                    setSelected(t);
                  }}
                >
                  View details
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <TemplateDetailModal
        template={selected}
        onClose={() => setSelected(null)}
        onStart={handleStart}
        busy={busy}
        error={actionError}
      />

    </div>
  );
}

interface TemplateDetailModalProps {
  template: TemplateWithId | null;
  onClose: () => void;
  onStart: () => void;
  busy: boolean;
  error: string | null;
}

function TemplateDetailModal({ template, onClose, onStart, busy, error }: TemplateDetailModalProps) {
  const { data: questions, loading } = useAssessmentQuestions(template?.id ?? null);

  return (
    <Modal
      open={!!template}
      onClose={onClose}
      title={template?.title ?? ""}
      description={template ? `${template.category} · ${template.questionCount} questions` : ""}
      size="2xl"
    >
      {template?.description && (
        <p className="mb-4 text-sm text-gray-600">{template.description}</p>
      )}

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center">
          <Spinner label="Loading questions…" />
        </div>
      ) : questions.length === 0 ? (
        <p className="py-4 text-sm text-gray-500">This assessment has no questions yet.</p>
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Question {i + 1} · {QUESTION_TYPE_LABEL[q.type] ?? q.type}
                </div>
                {q.isRequired && <Badge variant="warning">Required</Badge>}
              </div>
              <p className="mt-1 text-sm text-gray-900">{q.prompt}</p>
              {q.options && q.options.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-sm text-gray-600">
                  {q.options.map((opt, oi) => (
                    <li key={oi}>{opt}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button onClick={onStart} isLoading={busy}>
          Start assessment
        </Button>
      </div>
    </Modal>
  );
}
