import { NavLink } from "react-router-dom";

export interface NavItem {
  /** Path the link points to, e.g. "/student/dashboard". */
  to: string;
  /** Visible label, e.g. "Dashboard". */
  label: string;
  /** Heroicons-style SVG path data, drawn at 24x24 with stroke-width 1.5. */
  iconPath: string;
}

interface SidebarProps {
  items: NavItem[];
  /** Called after a nav link is clicked. Useful for closing the mobile drawer. */
  onNavigate?: () => void;
}

/**
 * Sidebar renders a vertical list of navigation links. Each item is highlighted
 * when its route is active. Designed to sit on the left of the PortalLayout
 * on desktop and inside a slide-in drawer on mobile.
 */
export function Sidebar({ items, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-gray-200 bg-white">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
          <span className="text-sm font-bold text-white">SG</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">SPARTAN-G</p>
          <p className="text-xs text-gray-500">Web Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <svg
                  className={`h-5 w-5 flex-shrink-0 ${
                    isActive ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-500"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={item.iconPath}
                  />
                </svg>
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 py-3">
        <p className="text-xs text-gray-400">
          &copy; {new Date().getFullYear()} SPARTAN-G
        </p>
      </div>
    </aside>
  );
}
