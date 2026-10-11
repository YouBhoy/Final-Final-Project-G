import { Fragment } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { NavItem } from "./Sidebar";

interface TopNavProps {
  items: NavItem[];
  /** Extra classes, e.g. visibility rules from the layout. */
  className?: string;
}

/**
 * TopNav is a light horizontal navigation bar used in place of the Sidebar when
 * a portal opts in with `navPlacement="top"` on PortalLayout. It renders the
 * same NavItem list the Sidebar uses, so routes and labels stay defined in one
 * place (navigation/navConfigs.ts). Items with a different `group` than the
 * previous one are separated by a thin divider.
 *
 * Active page = red text + red bottom border (two cues, not color alone).
 * Items can also stay active on related routes via `activePrefixes`
 * (e.g. the assessment wizard at /student/assessment/:id).
 */
export function TopNav({ items, className = "" }: TopNavProps) {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Main navigation"
      className={`rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 shadow-card ${className}`}
    >
      <ul className="flex items-center gap-0.5 overflow-x-auto">
        {items.map((item, index) => {
          const startsGroup = index > 0 && item.group !== items[index - 1].group;
          const matchesPrefix =
            item.activePrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false;
          return (
            <Fragment key={item.to}>
              {startsGroup && (
                <li
                  aria-hidden="true"
                  className="mx-1 h-5 w-px shrink-0 bg-[var(--color-border)]"
                />
              )}
              <li className="shrink-0">
                <NavLink
                  to={item.to}
                  className={({ isActive: linkActive }) => {
                    const isActive = linkActive || matchesPrefix;
                    return `flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
                      isActive
                        ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                        : "border-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:text-[var(--color-text)]"
                    }`;
                  }}
                  aria-current={matchesPrefix ? "page" : undefined}
                >
                  {/* Icons only on wide screens so all items fit on one line */}
                  <svg
                    className="hidden h-4 w-4 flex-shrink-0 xl:block"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
                  </svg>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
}