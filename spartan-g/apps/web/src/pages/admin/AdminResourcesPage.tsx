import { useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useResources } from "../../hooks/useResources";
import { resourceService } from "@spartan-g/shared-services";
import {
  getErrorMessage,
  type ResourceAudience,
  type ResourceCategory,
} from "@spartan-g/shared-types";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";

type StatusFilter = "all" | "published" | "draft";

const CATEGORIES: { value: ResourceCategory; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "video", label: "Video" },
  { value: "guide", label: "Guide" },
  { value: "worksheet", label: "Worksheet" },
  { value: "helpline", label: "Helpline" },
  { value: "other", label: "Other" },
];

const AUDIENCES: { value: ResourceAudience; label: string }[] = [
  { value: "all", label: "Everyone (Students + Facilitators)" },
  { value: "students", label: "Students only" },
  { value: "facilitators", label: "Facilitators only" },
];

const EMPTY_FORM = {
  title: "",
  description: "",
  category: "article" as ResourceCategory,
  tags: "",
  url: "",
  audience: "all" as ResourceAudience,
  isActive: true,
};

type ResourceRow = { id: string } & Awaited<ReturnType<typeof resourceService.listAll>>[number];

/**
 * Super Admin — Resource Management.
 *
 * Full CRUD over the shared `resources` collection — the SAME data source
 * every portal's /resources page reads. Changes appear in the Student and
 * Facilitator portals immediately after a refresh (same Firestore docs).
 */
export function AdminResourcesPage() {
  const { user: actor } = useAuth();
  const { resources, loading, error, reload } = useResources(actor?.role, "all");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  // Create/edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Delete confirmation
  const [pendingDelete, setPendingDelete] = useState<ResourceRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: resources.length,
      published: resources.filter((r) => r.isActive).length,
      draft: resources.filter((r) => !r.isActive).length,
    }),
    [resources],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (statusFilter === "published" && !r.isActive) return false;
      if (statusFilter === "draft" && r.isActive) return false;
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        (r.description ?? "").toLowerCase().includes(term) ||
        (r.tags ?? []).some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [resources, statusFilter, search]);

  const ctx = () => ({
    actorRole: actor!.role,
    actorUid: actor!.uid,
    actorEmail: actor!.email,
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFile(null);
    setRemoveFile(false);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(row: ResourceRow) {
    setForm({
      title: row.title,
      description: row.description ?? "",
      category: row.category,
      tags: (row.tags ?? []).join(", "),
      url: row.url ?? "",
      audience: row.audience,
      isActive: row.isActive,
    });
    setEditingId(row.id);
    setFile(null);
    setRemoveFile(false);
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    if (!actor) return;
    const title = form.title.trim();
    if (!title) {
      setFormError("Title is required.");
      return;
    }
    if (form.url.trim() && !/^https?:\/\//i.test(form.url.trim())) {
      setFormError("Link must start with http:// or https://");
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const payload = {
        title,
        description: form.description.trim() || undefined,
        category: form.category,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        url: form.url.trim() || undefined,
        audience: form.audience,
        isActive: form.isActive,
        file: file ? { blob: await file.arrayBuffer().then((b) => new Blob([b], { type: file.type })), fileName: file.name } : undefined,
      };

      if (editingId) {
        await resourceService.updateResource(
          editingId,
          {
            ...payload,
            file: payload.file,
            removeFile: removeFile && !payload.file,
          },
          ctx(),
        );
      } else {
        await resourceService.createResource(payload, ctx());
      }

      setModalOpen(false);
      await reload();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!actor || !pendingDelete) return;
    setActionError(null);
    setBusy(true);
    try {
      await resourceService.deleteResource(pendingDelete.id, ctx());
      setPendingDelete(null);
      await reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner label="Loading resources…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load resources: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Resources
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Curate the global resource library shared with Students and Facilitators.
          </p>
        </div>
        <Button onClick={openCreate}>+ New resource</Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "published", "draft"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === f
                  ? "bg-indigo-100 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f === "all"
                ? `All (${counts.all})`
                : f === "published"
                  ? `Published (${counts.published})`
                  : `Drafts (${counts.draft})`}
            </button>
          ))}
        </div>
        <div className="w-full sm:max-w-xs">
          <Input
            label="Search"
            placeholder="Search title, description, tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No resources yet"
          description="Add articles, videos, guides, and helplines for Students and Facilitators."
          action={<Button onClick={openCreate}>+ New resource</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Title", "Category", "Audience", "Status", "Updated"].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-900">{r.title}</span>
                        {r.description && (
                          <span className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                            {r.description}
                          </span>
                        )}
                        <span className="mt-0.5 text-xs text-gray-400">
                          {r.url ? "External link" : r.fileUrl ? "Uploaded file" : "No link"}
                          {(r.tags ?? []).length > 0 && ` · ${(r.tags ?? []).slice(0, 3).join(", ")}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <Badge variant="neutral">
                        {CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {AUDIENCES.find((a) => a.value === r.audience)?.label ?? r.audience}
                    </td>
                    <td className="px-6 py-4">
                      {r.isActive ? (
                        <Badge variant="success">Published</Badge>
                      ) : (
                        <Badge variant="neutral">Draft</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {r.updatedAt &&
                      typeof (r.updatedAt as { toDate?: () => Date }).toDate === "function"
                        ? (r.updatedAt as { toDate: () => Date }).toDate().toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="rounded-md px-2.5 py-1 text-indigo-600 hover:bg-indigo-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActionError(null);
                            setPendingDelete(r);
                          }}
                          className="rounded-md px-2.5 py-1 text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create / Edit resource modal */}
      <Modal
        open={modalOpen}
        onClose={() => (busy ? null : setModalOpen(false))}
        title={editingId ? "Edit resource" : "New resource"}
        description="Resources appear on the shared /resources page for Students and Facilitators."
        size="2xl"
      >
        {formError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {formError}
          </div>
        )}

        <div className="space-y-4">
          <Input
            label="Title"
            required
            placeholder="e.g. Coping with exam anxiety"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            disabled={busy}
          />

          <div className="space-y-1">
            <label htmlFor="res-description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="res-description"
              rows={3}
              placeholder="Short summary shown on the resource card…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={busy}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ResourceCategory })}
              disabled={busy}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select
              label="Audience"
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value as ResourceAudience })}
              disabled={busy}
            >
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label={form.category === "video" ? "YouTube or external link" : "Link (URL)"}
            placeholder="https://…"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            disabled={busy}
          />
          {form.category === "video" && (
            <p className="-mt-2 text-xs text-gray-500">
              Paste a YouTube watch, Shorts, or youtu.be link to show an embedded player.
            </p>
          )}

          <Input
            label="Tags"
            placeholder="Comma-separated, e.g. anxiety, self-help, video"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            disabled={busy}
          />

          <div className="space-y-1">
            <label htmlFor="res-file" className="block text-sm font-medium text-gray-700">
              Attachment (optional)
            </label>
            <input
              id="res-file"
              type="file"
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setRemoveFile(false);
              }}
              disabled={busy}
            />
            {editingId && removeFile && !file && (
              <p className="text-xs text-amber-600">The attached file will be removed on save.</p>
            )}
            {editingId &&
              !file &&
              !removeFile &&
              resources.find((r) => r.id === editingId)?.fileUrl && (
                <div className="flex items-center gap-3">
                  <a
                    href={resources.find((r) => r.id === editingId)?.fileUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    View current file
                  </a>
                  <button
                    type="button"
                    onClick={() => setRemoveFile(true)}
                    className="text-xs text-red-600 hover:underline"
                    disabled={busy}
                  >
                    Remove file
                  </button>
                </div>
              )}
            <p className="text-xs text-gray-500">
              PDF, images, or Word documents up to 20 MB. Stored in Firebase Storage.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              disabled={busy}
            />
            Published — visible to Students and Facilitators (uncheck to save as a draft)
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setModalOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} isLoading={busy}>
            {editingId ? "Save changes" : "Create resource"}
          </Button>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={!!pendingDelete}
        onClose={() => (busy ? null : setPendingDelete(null))}
        title="Delete resource?"
        description="This permanently removes the entry from the shared resource library."
        size="md"
      >
        {actionError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {actionError}
          </div>
        )}
        {pendingDelete && (
          <p className="text-sm text-gray-700">
            <span className="font-medium">{pendingDelete.title}</span>
            {pendingDelete.description ? ` — ${pendingDelete.description}` : ""}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} isLoading={busy}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
