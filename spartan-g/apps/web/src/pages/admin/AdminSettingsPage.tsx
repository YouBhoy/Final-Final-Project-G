import { Link } from "react-router-dom";

export function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold tracking-tight text-[var(--color-text)] sm:text-3xl">
          Platform Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Configure system-wide preferences and integrations.
        </p>
      </div>

      <section aria-labelledby="privacy-settings-title" className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-card">
        <h2 id="privacy-settings-title" className="text-lg font-semibold text-[var(--color-text)]">Privacy Policy</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
          Review and edit the privacy agreement students and facilitators see when they log in or sign up.
        </p>
        <Link to="/admin/privacy" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]">
          Manage privacy policy
        </Link>
      </section>
      <section aria-labelledby="audit-settings-title" className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-card">
        <h2 id="audit-settings-title" className="text-lg font-semibold text-[var(--color-text)]">Audit Log</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
          Review recorded platform activity and administrative changes.
        </p>
        <Link to="/admin/audit-logs" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]">
          View audit log
        </Link>
      </section>
    </div>
  );
}
