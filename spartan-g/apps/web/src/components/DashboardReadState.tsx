import type { ReactNode } from 'react';
import type { DashboardSection } from '../hooks/useDashboardSections';

/** Retains the existing layout while distinguishing failure from a successful empty result. */
export function DashboardReadState({ section, label, retry, children }: {
  section: DashboardSection<unknown>; label: string; retry: () => void; children: ReactNode;
}) {
  if (section.loading) return <p role="status" aria-live="polite">Loading {label}…</p>;
  if (section.error) return <div role="alert"><p>{label}: {section.error}</p><button type="button" onClick={retry}>Retry {label}</button></div>;
  if (section.data === null) return <p role="status">{label} unavailable.</p>;
  return <>{children}</>;
}
