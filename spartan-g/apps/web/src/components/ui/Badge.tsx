import type { ReactNode } from "react";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "neutral";

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variantStyles: Record<Variant, string> = {
  default: "bg-[var(--color-primary)]/10 text-[var(--color-primary)] ring-[var(--color-primary)]/20",
  success: "bg-[var(--color-success-bg)] text-[var(--color-success)] ring-[var(--color-success)]/20",
  warning: "bg-[var(--color-warning-bg)] text-[var(--color-warning)] ring-[var(--color-warning)]/20",
  danger: "bg-[var(--color-error-bg)] text-[var(--color-error)] ring-[var(--color-error)]/20",
  info: "bg-[var(--color-info-bg)] text-[var(--color-info)] ring-[var(--color-info)]/20",
  neutral: "bg-[var(--color-bg-alt)] text-[var(--color-text-secondary)] ring-[var(--color-text-muted)]/20",
};

/** Small pill-shaped status / category indicator. */
export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
