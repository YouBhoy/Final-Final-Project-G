import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_LABELS } from "@spartan-g/shared-types";
import { NotificationBell } from "../notifications/NotificationBell";
import { useTheme } from "../../providers/ThemeProvider";

interface HeaderProps {
  /** Display name of the portal, shown on the left. */
  portalName: string;
  /** Optional subtitle shown beneath the portal name. */
  portalTagline?: string;
  /** Called when the hamburger button is pressed (mobile only). */
  onMenuClick?: () => void;
  /** With "top", the hamburger stays visible until the top nav appears (lg). */
  navPlacement?: "side" | "top";
}

/**
 * Header is the top bar shown in every portal.
 * Left: BatStateU branding. Right: theme toggle, notification bell and a
 * profile menu (profile link + sign out) so the bar stays uncluttered.
 */
export function Header({ portalName, portalTagline, onMenuClick, navPlacement = "side" }: HeaderProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close the profile menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

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

  const menuHideClass = navPlacement === "top" ? "lg:hidden" : "md:hidden";
  const roleKey = user?.role ?? "student";
  const roleLabel = user ? ROLE_LABELS[roleKey] : "";
  const profilePath =
    roleKey === "facilitator"
      ? "/facilitator/profile"
      : roleKey === "super_admin"
        ? null
        : "/student/profile";
  const displayName = user?.displayName ?? user?.email ?? "";

  const iconButton =
    "inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-alt)] hover:text-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]";
  const menuItem =
    "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-alt)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left section */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={onMenuClick}
            className={`${iconButton} ${menuHideClass}`}
            aria-label="Open navigation"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
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
                <p className="text-xs text-[var(--color-text-secondary)]">{portalTagline}</p>
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
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className={iconButton}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? (
              /* Sun icon */
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              /* Moon icon */
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
          </button>

          {/* Notifications */}
          <NotificationBell />

          {/* Profile menu */}
          {user && (
            <div className="relative ml-1" ref={menuRef}>
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Account menu for ${displayName}`}
                className="flex items-center gap-2 rounded-[var(--radius-md)] p-1 pr-2 transition-colors hover:bg-[var(--color-bg-alt)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-primary)] text-sm font-semibold text-white">
                  {initials(user.displayName ?? user.email)}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[10rem] truncate text-sm font-medium leading-tight text-[var(--color-text)]">
                    {displayName}
                  </span>
                  <span className="block text-xs leading-tight text-[var(--color-text-secondary)]">
                    {roleLabel}
                  </span>
                </span>
                <svg
                  className={`hidden h-4 w-4 text-[var(--color-text-secondary)] transition-transform duration-150 motion-reduce:transition-none sm:block ${
                    menuOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Account"
                  className="absolute right-0 top-full z-40 mt-2 w-64 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-dropdown"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                      {displayName}
                    </p>
                    {user.email && user.displayName && (
                      <p className="truncate text-xs text-[var(--color-text-secondary)]">
                        {user.email}
                      </p>
                    )}
                    <span className="mt-1.5 inline-flex rounded-full bg-[var(--color-primary-pastel)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary)]">
                      {roleLabel}
                    </span>
                  </div>
                  <div className="my-1 border-t border-[var(--color-border)]" role="separator" />
                  {profilePath && <button
                    type="button"
                    role="menuitem"
                    className={menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      navigate(profilePath);
                    }}
                  >
                    Profile
                  </button>}
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItem}
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                  >
                    {isLoggingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          )}
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
