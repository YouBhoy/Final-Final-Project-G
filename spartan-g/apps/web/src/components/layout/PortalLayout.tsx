import { useState, type ReactNode } from "react";
import { Sidebar, type NavItem } from "./Sidebar";
import { Header } from "./Header";
import { TopNav } from "./TopNav";

interface PortalLayoutProps {
  /** The display name of the portal, shown in the header (e.g. "Student Portal"). */
  portalName: string;
  /** Short tagline shown beneath the portal name in the header. */
  portalTagline?: string;
  /** Items rendered inside the sidebar. */
  navItems: NavItem[];
  /**
   * Where the navigation lives.
   *  - "side" (default): fixed left sidebar on desktop.
   *  - "top": horizontal bar above the page content on large screens.
   * On smaller screens both use the slide-in drawer opened from the Header.
   */
  navPlacement?: "side" | "top";
  /** Decorative photo behind portal content; defaults to the shared campus background. */
  backgroundImage?: string;
  /** The page content. */
  children: ReactNode;
}

/**
 * PortalLayout is the reusable shell for role-based portals (Student, Facilitator, Admin).
 *
 * It is composed of:
 *  - a fixed Sidebar with role-specific navigation (visible on desktop, hidden on mobile)
 *  - a slide-in drawer version of the same Sidebar for mobile (controlled by Header)
 *  - a top Header with the current user, role badge, and logout
 *  - a main content area that renders the matched route
 *
 * Responsive behavior:
 *  - On mobile (< md), the desktop sidebar is hidden and the Header shows a hamburger that opens a drawer.
 *  - On tablet/desktop (>= md), the sidebar is fixed to the left edge and the content is offset with left padding.
 */
export function PortalLayout({
  portalName,
  portalTagline,
  navItems,
  navPlacement = "side",
  backgroundImage = '/campus-background.jpg',
  children,
}: PortalLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const topNav = navPlacement === "top";
  // The drawer is the fallback wherever the permanent nav isn't shown.
  const drawerHideClass = topNav ? "lg:hidden" : "md:hidden";

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Desktop sidebar (fixed, full height) — side placement only */}
      {!topNav && (
        <div className="z-20 hidden md:flex md:fixed md:inset-y-0 md:left-0 md:w-64 md:flex-col">
          <Sidebar portalName={portalName} items={navItems} />
        </div>
      )}

      {/* Mobile drawer */}
      <div
        className={`${drawerHideClass} fixed inset-0 z-40 ${
          mobileOpen ? "" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-[var(--color-text)]/50 transition-opacity duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        {/* Drawer */}
        <div
          className={`absolute inset-y-0 left-0 w-64 transform bg-[var(--color-surface)] shadow-dropdown transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar portalName={portalName} items={navItems} onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      {/* Content column — offset on desktop to make room for the fixed sidebar */}
      <div className={`relative isolate min-h-screen ${topNav ? "" : "md:ml-64"}`}>
        {backgroundImage && (
          <div
            aria-hidden="true"
            className={`portal-photo-background pointer-events-none fixed bottom-0 left-0 right-0 top-16 -z-10 ${topNav ? "" : "md:left-64"}`}
            style={{ backgroundImage: `url("${backgroundImage}")` }}
          />
        )}
        <Header
          portalName={portalName}
          portalTagline={portalTagline}
          navPlacement={navPlacement}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {topNav && <TopNav items={navItems} className="mb-6 hidden lg:block" />}
          {children}
        </main>
      </div>
    </div>
  );
}
