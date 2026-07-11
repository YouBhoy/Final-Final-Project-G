interface PlaceholderPageProps {
  /** Page title shown as the H1. */
  title: string;
  /** Short description shown beneath the title. */
  description?: string;
  /** Optional icon SVG path data (24x24, stroke-width 1.5). */
  iconPath?: string;
}

/**
 * Placeholder page for routes whose functionality has not yet been implemented.
 * Styled to match the BatStateU design system — shown as a roadmap card,
 * not a dashed placeholder.
 */
export function PlaceholderPage({
  title,
  description = "This feature is part of our planned scope and is being developed.",
  iconPath = "M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18",
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
        )}
      </div>

      <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-8 shadow-card">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-accent)]/10">
            <svg
              className="h-8 w-8 text-[var(--color-accent)]"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={iconPath}
              />
            </svg>
          </div>
          <h2 className="mt-4 font-[family-name:var(--font-heading)] text-lg font-semibold text-[var(--color-text)]">
            Coming soon
          </h2>
          <p className="mt-2 max-w-md text-sm text-[var(--color-text-secondary)]">
            {description} We'll notify you once it's ready.
          </p>
          {/* Gold accent */}
          <div className="mt-4 h-0.5 w-12 rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-light)]" />
        </div>
      </div>
    </div>
  );
}