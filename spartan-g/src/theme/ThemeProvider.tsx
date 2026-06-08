import { createContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useAppStore } from '@/store/app.store';
import { lightColors, darkColors, ColorScheme } from './colors';
import { typography } from './typography';
import { spacing, borderRadius, shadows } from './spacing';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Theme {
  mode: 'light' | 'dark';
  colors: ColorScheme;
  typography: typeof typography;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  shadows: typeof shadows;
}

export const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const themeMode = useAppStore((s) => s.themeMode);
  const systemScheme = useColorScheme();

  const resolvedMode: 'light' | 'dark' =
    themeMode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;

  const theme = useMemo<Theme>(
    () => ({
      mode: resolvedMode,
      colors: resolvedMode === 'dark' ? darkColors : lightColors,
      typography,
      spacing,
      borderRadius,
      shadows,
    }),
    [resolvedMode],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
