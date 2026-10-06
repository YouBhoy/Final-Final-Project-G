import { useMemo, useState } from "react";
import type { Role, ResourceCategory } from "@spartan-g/shared-types";
import { useResources } from "../../hooks/useResources";
import { Badge } from "../ui/Badge";
import { Card, CardBody } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Input } from "../ui/Input";
import { Spinner } from "../ui/Spinner";

const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  article: "Article",
  video: "Video",
  guide: "Guide",
  worksheet: "Worksheet",
  helpline: "Helpline",
  other: "Other",
};

function getYouTubeEmbedUrl(value: string | null | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    let videoId: string | null = null;

    if (hostname === "youtu.be") {
      videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (hostname === "youtube.com" || hostname === "www.youtube.com") {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v");
      } else if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/")[2] ?? null;
      }
    }

    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`
      : null;
  } catch {
    return null;
  }
}

interface ResourcesBrowsePageProps {
  /** The signed-in viewer's role — controls the audience filter. */
  actorRole: Role | undefined;
}

/**
 * Read-only resource library shared by the Student and Facilitator portals
 * (and available to Super Admins).
 *
 * Reads the SAME `resources` Firestore collection the Super Admin manages —
 * admin changes show up here immediately. Only published (isActive) entries
 * are returned; rules enforce that server-side as well.
 */
export function ResourcesBrowsePage({ actorRole }: ResourcesBrowsePageProps) {
  const { resources, loading, error } = useResources(actorRole, "published");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ResourceCategory | "all">("all");

  /** Show only entries meant for this role (client-side display filter). */
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (r.audience === "students" && actorRole !== "student") return false;
      if (r.audience === "facilitators" && actorRole !== "facilitator") return false;
      if (category !== "all" && r.category !== category) return false;
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        (r.description ?? "").toLowerCase().includes(term) ||
        (r.tags ?? []).some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [resources, actorRole, search, category]);

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Resources
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Curated articles, videos, guides, and helplines to support your wellbeing.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <Input
            label="Search"
            placeholder="Search resources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:max-w-xs">
          <label htmlFor="res-cat" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            id="res-cat"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            value={category}
            onChange={(e) => setCategory(e.target.value as ResourceCategory | "all")}
          >
            <option value="all">All categories</option>
            {(Object.keys(CATEGORY_LABELS) as ResourceCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No resources found"
          description={
            resources.length === 0
              ? "No resources have been published yet. Check back soon."
              : "Try a different search or category."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((r) => (
            <Card key={r.id} className="flex flex-col">
              <CardBody className="flex flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-gray-900">{r.title}</h2>
                  <Badge variant="neutral">
                    {CATEGORY_LABELS[r.category] ?? r.category}
                  </Badge>
                </div>

                {r.category === "video" && getYouTubeEmbedUrl(r.url) && (
                  <div className="overflow-hidden rounded-lg bg-gray-100">
                    <iframe
                      className="aspect-video w-full"
                      src={getYouTubeEmbedUrl(r.url) ?? undefined}
                      title={r.title}
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                )}

                {r.description && <p className="text-sm text-gray-600">{r.description}</p>}

                {(r.tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(r.tags ?? []).map((t) => (
                      <Badge key={t} variant="info">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Open link
                    </a>
                  )}
                  {r.fileUrl && (
                    <a
                      href={r.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      download
                      className="inline-flex items-center rounded-md border border-indigo-600 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50"
                    >
                      Download
                    </a>
                  )}
                  {!r.url && !r.fileUrl && (
                    <span className="text-xs text-gray-400">No link available</span>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
