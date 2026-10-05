import type { ReactNode } from "react";
import { ThemeProvider } from "./ThemeProvider";

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * AppProviders wraps the app in the providers that sit above routing.
 * Auth is handled separately inside AppRouter via AuthProvider.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return <ThemeProvider>{children}</ThemeProvider>;
}