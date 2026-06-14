import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

/** Friendly empty-state used by lists with no data. */
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
