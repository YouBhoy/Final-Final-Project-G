import { useState } from "react";
import { Link } from "react-router-dom";
import { useAllAssessmentTemplates, type TemplateWithId } from "../../hooks/useAssessmentTemplates";
import { useAuth } from "../../hooks/useAuth";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { disableTemplate, reenableTemplate } from "../../lib/assessments";
import { ROLES } from "@spartan-g/shared-types";
import { getErrorMessage } from "@spartan-g/shared-types";

type StatusFilter = "all" | "active" | "disabled";

export function AssessmentTemplatesPage() {
  const { user } = useAuth();
  const { data, loading, error } = useAllAssessmentTemplates();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [pending, setPending] = useState<TemplateWithId | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = data.filter((t) =>
    filter === "all" ? true : filter === "active" ? t.isActive : !t.isActive,
  );

  async function handleConfirm() {
    if (!pending || !user) return;
    setBusy(true);
    setActionError(null);
    try {
      if (pending.isActive) {
        await disableTemplate(pending.id, user.role);
      } else {
        await reenableTemplate(pending.id, user.role);
      }
      setPending(null);
    } catch (e) {
      setActionError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading templates…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load templates: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Assessment Templates
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage the assessments available to students.
          </p>
        </div>
        <Link to="/admin/assessment-templates/new">
          <Button>+ New template</Button>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {(["all", "active", "disabled"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f
                ? "bg-indigo-100 text-indigo-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f === "all" ? `All (${data.length})` : f === "active" ? `Active (${data.filter((t) => t.isActive).length})` : `Disabled (${data.filter((t) => !t.isActive).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Create your first assessment template to publish it to students."
          action={
            <Link to="/admin/assessment-templates/new">
              <Button>Create template</Button>
            </Link>
          }
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
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Questions
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
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{t.title}</div>
                      {t.description && (
                        <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                          {t.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <Badge variant="neutral">{t.category}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{t.questionCount}</td>
                    <td className="px-6 py-4 text-sm">
                      {t.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="neutral">Disabled</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/assessment-templates/${t.id}/edit`}
                          className="rounded-md px-2.5 py-1 text-indigo-600 hover:bg-indigo-50"
                        >
                          Edit
                        </Link>
                        {user?.role === ROLES.SUPER_ADMIN && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              setPending(t);
                            }}
                            className={`rounded-md px-2.5 py-1 ${
                              t.isActive
                                ? "text-red-600 hover:bg-red-50"
                                : "text-emerald-600 hover:bg-emerald-50"
                            }`}
                          >
                            {t.isActive ? "Disable" : "Re-enable"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={!!pending}
        onClose={() => (busy ? null : setPending(null))}
        title={pending?.isActive ? "Disable template?" : "Re-enable template?"}
        description={
          pending?.isActive
            ? "Students will no longer be able to start new attempts, but existing data is preserved."
            : "Students will once again be able to start new attempts on this template."
        }
        size="md"
      >
        {actionError && (
          <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
            {actionError}
          </div>
        )}
        {pending && (
          <p className="text-sm text-gray-700">
            <span className="font-medium">{pending.title}</span> — {pending.category}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={pending?.isActive ? "danger" : "primary"}
            onClick={handleConfirm}
            isLoading={busy}
          >
            {pending?.isActive ? "Disable" : "Re-enable"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
