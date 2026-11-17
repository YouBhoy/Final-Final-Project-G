import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  caption: string;
  icon?: ReactNode;
  className?: string;
  labelStyle?: "default" | "eyebrow";
}

/** Shared dashboard metric surface used by student and staff portals. */
export function StatCard({
  label,
  value,
  caption,
  icon,
  className = "",
  labelStyle = "default",
}: StatCardProps) {
  return (
    <div className={`portal-stat-card glass ${className}`.trim()}>
      <div className="portal-stat-card__top">
        <p className={labelStyle === "eyebrow" ? "portal-stat-card__label portal-stat-card__label--eyebrow" : "portal-stat-card__label"}>
          {label}
        </p>
        {icon}
      </div>
      <p className="portal-stat-card__value">{value}</p>
      <p className="portal-stat-card__caption">{caption}</p>
    </div>
  );
}
