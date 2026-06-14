import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** A plain rounded surface for grouping content. */
export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border-b border-gray-200 px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-6 py-5 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}
