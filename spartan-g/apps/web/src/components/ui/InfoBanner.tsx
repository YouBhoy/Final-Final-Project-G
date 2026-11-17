import type { ReactNode } from "react";

/** Shared informational notice styled for the authenticated glass surfaces. */
export function InfoBanner({ children }: { children: ReactNode }) {
  return <div role="note" className="glass-info-banner">
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" />
    </svg>
    <div>{children}</div>
  </div>;
}
