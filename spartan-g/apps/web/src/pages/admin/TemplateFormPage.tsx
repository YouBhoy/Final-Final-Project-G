import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Textarea } from "../../components/ui/Textarea";
import { Select } from "../../components/ui/Select";
import { Card, CardBody, CardFooter, CardHeader } from "../../components/ui/Card";
import { Spinner } from "../../components/ui/Spinner";
import { Badge } from "../../components/ui/Badge";
import { useAuth } from "../../hooks/useAuth";
import { useAssessmentQuestions } from "../../hooks/useAssessmentQuestions";
import { createTemplate, updateTemplate } from "../../lib/assessments";
import { assessmentTemplateRepository } from "@spartan-g/shared-services";
import { getErrorMessage, ROLES, type AssessmentQuestionType } from "@spartan-g/shared-types";

const QUESTION_TYPES: { value: AssessmentQuestionType; label: string; needsOptions: boolean }[] = [
  { value: "short_text", label: "Short text", needsOptions: false },
  { value: "long_text", label: "Long text", needsOptions: false },
  { value: "single_choice", label: "Single choice", needsOptions: true },
  { value: "multi_choice", label: "Multiple choice", needsOptions: true },
  { value: "scale_1_5", label: "Scale 1–5", needsOptions: false },
  { value: "scale_1_10", label: "Scale 1–10", needsOptions: false },
  { value: "yes_no", label: "Yes / No", needsOptions: false },
];

interface QuestionDraft {
  prompt: string;
  type: AssessmentQuestionType;
  options: string[];
  isRequired: boolean;
}

const emptyQuestion = (): QuestionDraft => ({
  prompt: "",
  type: "short_text",
  options: [],
  isRequired: true,
});

export function TemplateFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);

  // When editing, hydrate the form with the saved template + questions
  const { data: existingQuestions } = useAssessmentQuestions(isEdit ? id ?? null : null);
  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const tpl = await assessmentTemplateRepository.getById(id);
        if (cancelled || !tpl) return;
        setTitle(tpl.title);
        setDescription(tpl.description);
        setCategory(tpl.category);
      } catch (e) {
        setSubmitError(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEdit, id]);

  useEffect(() => {
    if (!isEdit) return;
    if (existingQuestions.length === 0) return;
    setQuestions(
      existingQuestions.map((q) => ({
        prompt: q.prompt,
        type: q.type,
        options: q.options ?? [],
        isRequired: q.isRequired,
      })),
    );
  }, [existingQuestions, isEdit]);

  const questionCount = questions.length;

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function setOption(qIndex: number, oIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const opts = [...q.options];
        opts[oIndex] = value;
        return { ...q, options: opts };
      }),
    );
  }

  function addOption(qIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qIndex ? { ...q, options: [...q.options, ""] } : q)),
    );
  }

  function removeOption(qIndex: number, oIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        return { ...q, options: q.options.filter((_, j) => j !== oIndex) };
      }),
    );
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!title.trim()) errors.title = "Title is required";
    if (!category.trim()) errors.category = "Category is required";
    if (description.length > 500) errors.description = "Description is too long (max 500 chars)";

    questions.forEach((q, i) => {
      if (!q.prompt.trim()) {
        errors[`q${i}_prompt`] = "Question text is required";
      }
      const needsOptions = QUESTION_TYPES.find((t) => t.value === q.type)?.needsOptions;
      if (needsOptions && q.options.filter((o) => o.trim()).length < 2) {
        errors[`q${i}_options`] = "Provide at least two options";
      }
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitError(null);

    if (!validate()) return;

    setBusy(true);
    try {
      const payloadQuestions = questions.map((q, i) => ({
        prompt: q.prompt.trim(),
        type: q.type,
        options:
          QUESTION_TYPES.find((t) => t.value === q.type)?.needsOptions
            ? q.options.map((o) => o.trim()).filter(Boolean)
            : undefined,
        isRequired: q.isRequired,
        order: i,
      }));

      if (isEdit && id) {
        await updateTemplate(
          id,
          {
            title: title.trim(),
            description: description.trim(),
            category: category.trim(),
            questions: payloadQuestions,
          },
          user.role,
        );
      } else {
        await createTemplate(
          {
            title: title.trim(),
            description: description.trim(),
            category: category.trim(),
            createdBy: user.uid,
            questions: payloadQuestions,
          },
          user.role,
        );
      }
      navigate(
        user.role === ROLES.FACILITATOR
          ? "/facilitator/assessments"
          : "/admin/assessment-templates",
      );
    } catch (e) {
      setSubmitError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const heading = useMemo(
    () => (isEdit ? "Edit assessment template" : "New assessment template"),
    [isEdit],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading template…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to={user?.role === ROLES.FACILITATOR ? "/facilitator/assessments" : "/admin/assessment-templates"}
            className="text-sm text-indigo-600 hover:text-indigo-500"
          >
            ← Back to templates
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {heading}
          </h1>
        </div>
        <Badge variant="info">{questionCount} {questionCount === 1 ? "question" : "questions"}</Badge>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {submitError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
            {submitError}
          </div>
        )}

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Details</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={formErrors.title}
              placeholder="e.g. Weekly Wellbeing Check-in"
              required
            />
            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              error={formErrors.description}
              placeholder="Explain what this assessment measures and how long it takes."
              rows={3}
            />
            <Input
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              error={formErrors.category}
              placeholder="e.g. Wellbeing, Stress, Sleep"
              required
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Questions</h2>
            <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
              + Add question
            </Button>
          </CardHeader>
          <CardBody className="space-y-5">
            {questions.map((q, i) => {
              const typeMeta = QUESTION_TYPES.find((t) => t.value === q.type);
              return (
                <div
                  key={i}
                  className="rounded-lg border border-gray-200 bg-gray-50/50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700">
                      Question {i + 1}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveQuestion(i, -1)}
                        disabled={i === 0}
                        className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(i, 1)}
                        disabled={i === questions.length - 1}
                        className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuestion(i)}
                        disabled={questions.length === 1}
                        className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-30"
                        aria-label="Remove question"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Textarea
                      label="Prompt"
                      value={q.prompt}
                      onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
                      error={formErrors[`q${i}_prompt`]}
                      rows={2}
                      required
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Select
                        label="Type"
                        value={q.type}
                        onChange={(e) =>
                          updateQuestion(i, {
                            type: e.target.value as AssessmentQuestionType,
                            options:
                              QUESTION_TYPES.find((t) => t.value === e.target.value)
                                ?.needsOptions
                                ? q.options.length
                                  ? q.options
                                  : ["", ""]
                                : [],
                          })
                        }
                      >
                        {QUESTION_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={q.isRequired}
                            onChange={(e) => updateQuestion(i, { isRequired: e.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          Required
                        </label>
                      </div>
                    </div>

                    {typeMeta?.needsOptions && (
                      <div className="space-y-2">
                        <div className="text-xs font-medium text-gray-600">Options</div>
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-2">
                            <Input
                              label={`Option ${oi + 1}`}
                              value={opt}
                              onChange={(e) => setOption(i, oi, e.target.value)}
                              placeholder={`Option ${oi + 1}`}
                              className="flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => removeOption(i, oi)}
                              disabled={q.options.length <= 2}
                              className="rounded p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-30"
                              aria-label="Remove option"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        {formErrors[`q${i}_options`] && (
                          <p className="text-sm text-red-600">{formErrors[`q${i}_options`]}</p>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => addOption(i)}
                        >
                          + Add option
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </CardBody>
          <CardFooter>
            <Link to={user?.role === ROLES.FACILITATOR ? "/facilitator/assessments" : "/admin/assessment-templates"}>
              <Button type="button" variant="outline" disabled={busy}>
                Cancel
              </Button>
            </Link>
            <Button type="submit" isLoading={busy}>
              {isEdit ? "Save changes" : "Create template"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
