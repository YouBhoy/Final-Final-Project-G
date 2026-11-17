import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_LABELS } from "@spartan-g/shared-types";
import { NotificationBell } from "../notifications/NotificationBell";
import { Avatar } from "../ui/Avatar";

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
 * Left: BatStateU branding. Right: notification bell and an
 * profile menu (profile link + sign out) so the bar stays uncluttered.
 */
export function Header({ portalName, portalTagline, onMenuClick, navPlacement = "side" }: HeaderProps) {
  const { user, logout } = useAuth();
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

  const iconButton = "inline-flex h-10 w-10 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
  const menuItem = "header-profile-menu-item flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-white transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <header className="portal-glass-header glass sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
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
          <div className="portal-header-brand hidden items-center gap-3 sm:flex">
            {/* Official BatStateU Seal */}
            <img src="/batstateu-logo.png" alt="BatStateU Seal" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
            <div className="hidden h-8 w-px bg-[var(--color-border)] sm:block" />
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
          {/* Notifications */}
          <NotificationBell />

          {/* Account menu */}
          {user && (
            <div className="relative ml-1" ref={menuRef}>
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Account menu for ${displayName}`}
                className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Avatar name={user.displayName ?? user.email} size="sm" />
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[10rem] truncate text-sm font-medium leading-tight text-white">{displayName}</span>
                  <span className="block text-xs leading-tight text-white/80">{roleLabel}</span>
                </span>
                <svg className={`hidden h-4 w-4 text-white/80 transition-transform duration-150 motion-reduce:transition-none sm:block ${menuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Account"
                  className="header-profile-menu absolute right-0 top-full z-40 mt-2 w-64 max-w-[calc(100vw-32px)] rounded-[20px] p-2"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                    {user.email && user.displayName && <p className="truncate text-xs text-white/80">{user.email}</p>}
                    <span className="mt-1.5 inline-flex rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/90">{roleLabel}</span>
                  </div>
                  <div className="my-1 border-t border-white/20" role="separator" />
                  {profilePath && <button
                    type="button"
                    role="menuitem"
                    className={menuItem}
                    onClick={() => { setMenuOpen(false); navigate(profilePath); }}
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
