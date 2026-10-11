import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Role, ResourceCategory } from "@spartan-g/shared-types";
import { useResources } from "../../hooks/useResources";
import { Badge } from "../ui/Badge";
import { Card, CardBody } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Spinner } from "../ui/Spinner";

const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  article: "Article",
  video: "Video",
  guide: "Guide",
  worksheet: "Worksheet",
  helpline: "Helpline",
  other: "Other",
};

const ACTION_LABELS: Record<ResourceCategory, string> = {
  article: "Read article",
  video: "Watch video",
  guide: "Read guide",
  worksheet: "Open worksheet",
  helpline: "Get support",
  other: "Open resource",
};

const fieldClass =
  "mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] shadow-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";

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
  const [activeTag, setActiveTag] = useState<string | null>(null);

  /** Entries meant for this role (client-side display filter). */
  const audienceResources = useMemo(
    () =>
      resources.filter((r) => {
        if (r.audience === "students" && actorRole !== "student") return false;
        if (r.audience === "facilitators" && actorRole !== "facilitator") return false;
        return true;
      }),
    [resources, actorRole],
  );

  /** Tag chips are built from the tags that actually exist on resources. */
  const allTags = useMemo(() => {
    const set = new Set<string>();
    audienceResources.forEach((r) => (r.tags ?? []).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [audienceResources]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return audienceResources.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (activeTag && !(r.tags ?? []).includes(activeTag)) return false;
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        (r.description ?? "").toLowerCase().includes(term) ||
        (CATEGORY_LABELS[r.category] ?? r.category).toLowerCase().includes(term) ||
        (r.tags ?? []).some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [audienceResources, search, category, activeTag]);

  const hasFilters = search.trim() !== "" || category !== "all" || activeTag !== null;
  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setActiveTag(null);
  };

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
      {/* Intro banner */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-pastel)] px-6 py-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
          Resources
        </h1>
        <p className="mt-1 text-base font-medium text-[var(--color-text)]">
          Take a moment for yourself.
        </p>
        <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
          Explore videos, articles, guides, and helplines for managing stress, building
          healthy habits, and looking after your mental well-being.
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:max-w-xs">
            <label htmlFor="res-search" className="block text-sm font-medium text-[var(--color-text-secondary)]">
              Search
            </label>
            <input
              id="res-search"
              type="search"
              className={fieldClass}
              placeholder="Search resources…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:max-w-xs">
            <label htmlFor="res-cat" className="block text-sm font-medium text-[var(--color-text-secondary)]">
              Category
            </label>
            <select
              id="res-cat"
              className={fieldClass}
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

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by topic">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Topics
            </span>
            {allTags.map((t) => {
              const active = activeTag === t;
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveTag(active ? null : t)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-xs text-[var(--color-text-muted)]" aria-live="polite">
          Showing {visible.length} of {audienceResources.length} resources
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No resources found"
          description={
            audienceResources.length === 0
              ? "No resources have been published yet. Check back soon."
              : "Try a different search, category, or topic."
          }
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md border border-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-pastel)]"
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((r) => {
            const embed = r.category === "video" ? getYouTubeEmbedUrl(r.url) : null;
            return (
              <Card key={r.id} className="flex flex-col overflow-hidden">
                {embed && (
                  <iframe
                    className="aspect-video w-full bg-[var(--color-bg-alt)]"
                    src={embed}
                    title={r.title}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                )}
                <CardBody className="flex flex-1 flex-col gap-3">
                  <Badge variant="neutral" className="self-start">
                    {CATEGORY_LABELS[r.category] ?? r.category}
                  </Badge>
                  <h2 className="text-base font-semibold leading-snug text-[var(--color-text)]">
                    {r.title}
                  </h2>

                  {r.description && (
                    <p className="line-clamp-2 text-sm text-[var(--color-text-secondary)]">
                      {r.description}
                    </p>
                  )}

                  {(r.tags ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(r.tags ?? []).map((t) => (
                        <Badge key={t} variant="neutral">
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
                        className="inline-flex items-center rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]"
                      >
                        {ACTION_LABELS[r.category] ?? "Open resource"} ↗
                      </a>
                    )}
                    {r.fileUrl && (
                      <a
                        href={r.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        download
                        className="inline-flex items-center rounded-md border border-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-pastel)]"
                      >
                        Download
                      </a>
                    )}
                    {!r.url && !r.fileUrl && (
                      <span className="text-xs text-[var(--color-text-muted)]">No link available</span>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Professional support call-to-action (students only) */}
      {actorRole === "student" && (
        <div className="flex flex-col items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5 shadow-card sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Need someone to talk to?</h2>
            <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
              You don&apos;t have to figure everything out alone. Connect with a campus facilitator.
            </p>
          </div>
          <Link
            to="/student/facilitators"
            className="inline-flex shrink-0 items-center rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-dark)]"
          >
            Find a facilitator →
          </Link>
        </div>
      )}
    </div>
  );
}
