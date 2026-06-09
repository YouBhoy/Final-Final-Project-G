import { useState, type ReactNode } from "react";
import { Sidebar, type NavItem } from "./Sidebar";
import { Header } from "./Header";

interface PortalLayoutProps {
  /** The display name of the portal, shown in the header (e.g. "Student Portal"). */
  portalName: string;
  /** Short tagline shown beneath the portal name in the header. */
  portalTagline?: string;
  /** Items rendered inside the sidebar. */
  navItems: NavItem[];
  /** The page content. */
  children: ReactNode;
}

/**
 * PortalLayout is the reusable shell for role-based portals (Student, Facilitator, Admin).
 *
 * It is composed of:
 *  - a fixed/collapsible Sidebar with role-specific navigation
 *  - a top Header with the current user, role badge, and logout
 *  - a main content area that renders the matched route
 *
 * Responsive behavior:
 *  - On mobile (< md), the sidebar is rendered as a slide-in drawer controlled by a hamburger button in the header.
 *  - On tablet/desktop, the sidebar is permanently visible on the left.
 */
export function PortalLayout({
  portalName,
  portalTagline,
  navItems,
  children,
}: PortalLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar items={navItems} />
      </div>

      {/* Mobile sidebar (drawer) */}
      <div
        className={`md:hidden fixed inset-0 z-40 ${mobileOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-gray-900/50 transition-opacity duration-200 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setMobileOpen(false)}
        />
        {/* Drawer */}
        <div
          className={`absolute inset-y-0 left-0 w-64 transform bg-white shadow-xl transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar items={navItems} onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      {/* Content column */}
      <div className="md:pl-64">
        <Header
          portalName={portalName}
          portalTagline={portalTagline}
          onMenuClick={() => setMobileOpen(true)}
        />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
