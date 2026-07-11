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
 * with a maroon background and gold left-border indicator when active.
 */
export function Sidebar({ items, onNavigate }: SidebarProps) {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Brand Header — BatStateU Identity */}
      <div className="flex h-24 flex-col items-center justify-center border-b border-[var(--color-border)] px-5">
        {/* Seal + Wordmark */}
        <div className="flex items-center gap-3">
          {/* Official BatStateU Seal */}
          <img src="/batstateu-logo.png" alt="BatStateU Seal" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
          <div>
            <p className="font-[family-name:var(--font-heading)] text-sm font-bold leading-tight text-[var(--color-primary)]">
              Batangas State
            </p>
            <p className="font-[family-name:var(--font-heading)] text-sm font-bold leading-tight text-[var(--color-primary)]">
              University
            </p>
            <p className="mt-0.5 text-[10px] font-medium tracking-wider text-[var(--color-accent)] uppercase">
              Student Portal
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Sidebar navigation">
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-[var(--color-primary)] text-white shadow-sm"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-alt)] hover:text-[var(--color-primary)]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active indicator bar */}
                    {isActive && (
                      <span className="absolute left-0 h-6 w-[3px] rounded-r-full bg-[var(--color-accent)]" />
                    )}
                    <svg
                      className={`h-5 w-5 flex-shrink-0 transition-colors duration-150 ${
                        isActive
                          ? "text-[var(--color-accent)]"
                          : "text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)]"
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
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer — crest watermark + copyright */}
      <div className="relative border-t border-[var(--color-border)] px-5 py-4">
        {/* Watermark seal */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none select-none">
          <img src="/batstateu-logo.png" alt="" className="h-24 w-24" aria-hidden="true" />
        </div>
        <p className="relative text-[11px] text-[var(--color-text-muted)]">
          &copy; {new Date().getFullYear()} Batangas State University
        </p>
        <p className="relative text-[10px] text-[var(--color-text-muted)]">
          The National Engineering University
        </p>
      </div>
    </aside>
  );
}