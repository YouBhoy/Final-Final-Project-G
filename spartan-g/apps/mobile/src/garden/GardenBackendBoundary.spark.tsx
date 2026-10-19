import type { ReactNode } from 'react';

// No backend installer is imported into the normal Android Spark graph.
export function GardenBackendBoundary({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
