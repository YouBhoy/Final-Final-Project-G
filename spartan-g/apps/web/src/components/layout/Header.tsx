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

const roleBadgeStyles: Record<string, string> = {
  student: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  facilitator: "bg-blue-50 text-blue-700 ring-blue-600/20",
  super_admin: "bg-purple-50 text-purple-700 ring-purple-600/20",
};

/**
 * Header is the top bar shown in every portal. It includes:
 *  - a hamburger button (mobile only) to toggle the sidebar
 *  - the portal name and optional tagline
 *  - the current user's name, role badge, and a Sign-out button
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
      // Error is set in the auth context; we just stop the loading state.
    } finally {
      setIsLoggingOut(false);
    }
  }

  const roleKey = user?.role ?? "student";
  const badgeStyle = roleBadgeStyles[roleKey] ?? roleBadgeStyles.student;

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: hamburger + portal name */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 md:hidden"
            aria-label="Open navigation"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-base font-semibold text-gray-900 sm:text-lg">
              {portalName}
            </h1>
            {portalTagline && (
              <p className="hidden text-xs text-gray-500 sm:block">
                {portalTagline}
              </p>
            )}
          </div>
        </div>

        {/* Right: notification bell + user + logout */}
        <div className="flex items-center gap-1 sm:gap-2">
          <NotificationBell />
          {user && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-gray-900">
                {user.displayName ?? user.email}
              </p>
              <span
                className={`mt-0.5 inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeStyle}`}
              >
                {ROLE_LABELS[user.role]}
              </span>
            </div>
          )}

          {/* Avatar fallback (initials) */}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
            {initials(user?.displayName ?? user?.email)}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoggingOut ? (
              <svg
                className="h-4 w-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                />
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
