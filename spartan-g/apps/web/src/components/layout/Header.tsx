import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_LABELS } from "@spartan-g/shared-types";
import { NotificationBell } from "../notifications/NotificationBell";

interface HeaderProps {
  /** Display name of the portal, shown on the left. */
  portalName: string;
  /** Optional subtitle shown beneath the portal name. */
  portalTagline?: string;
  /** Called when the hamburger button is pressed (mobile only). */
  onMenuClick?: () => void;
}

/**
 * Header is the top bar shown in every portal.
 * Features BatStateU branding, notification bell, user info, and sign-out.
 */
export function Header({ portalName, portalTagline, onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      // Error is set in the auth context
    } finally {
      setIsLoggingOut(false);
    }
  }

  const roleKey = user?.role ?? "student";
  const roleLabel = user ? ROLE_LABELS[roleKey] : "";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left section */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-alt)] hover:text-[var(--color-primary)] md:hidden"
            aria-label="Open navigation"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>

          {/* University identifier — desktop */}
          <div className="hidden items-center gap-3 sm:flex">
            {/* Official BatStateU Seal */}
            <img src="/batstateu-logo.png" alt="BatStateU Seal" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
            <div className="h-8 w-px bg-[var(--color-border)]" />
            <div>
              <h1 className="font-[family-name:var(--font-heading)] text-base font-semibold leading-tight text-[var(--color-primary)]">
                {portalName}
              </h1>
              {portalTagline && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {portalTagline}
                </p>
              )}
            </div>
          </div>

          {/* Mobile title only */}
          <div className="sm:hidden">
            <h1 className="font-[family-name:var(--font-heading)] text-base font-semibold text-[var(--color-primary)]">
              {portalName}
            </h1>
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Notifications */}
          <NotificationBell />

          {/* User info — desktop */}
          {user && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-[var(--color-text)]">
                {user.displayName ?? user.email}
              </p>
              <span className="mt-0.5 inline-flex items-center rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary)]">
                {roleLabel}
              </span>
            </div>
          )}

          {/* Avatar with initials */}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white shadow-sm">
            {initials(user?.displayName ?? user?.email)}
          </div>

          {/* Sign out button */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-secondary)] shadow-sm transition-all duration-150 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoggingOut ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            )}
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+|@/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}