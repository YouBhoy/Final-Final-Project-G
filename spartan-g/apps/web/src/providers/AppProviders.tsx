import type { ReactNode } from "react";

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * AppProviders is kept minimal — auth is handled inside AppRouter via AuthProvider.
 * This wrapper exists for future providers (theme, etc.).
 */
export function AppProviders({ children }: AppProvidersProps) {
  return <>{children}</>;
}