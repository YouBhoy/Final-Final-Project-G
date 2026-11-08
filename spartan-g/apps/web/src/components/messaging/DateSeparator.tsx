/** Centered day label between message groups ("Today", "Yesterday", "Nov 5, 2026"). */
export function DateSeparator({ label }: { label: string }) {
  return (
    <div role="separator" aria-label={label} className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--color-border)]" aria-hidden="true" />
      <span className="rounded-full bg-[var(--color-bg-alt)] px-3 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--color-border)]" aria-hidden="true" />
    </div>
  );
}
