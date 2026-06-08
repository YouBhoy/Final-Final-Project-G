export * from './colors';
export * from './typography';
export * from './spacing';

export type ThemeMode = 'light' | 'dark' | 'system';

import { lightColors, darkColors, ColorScheme } from './colors';
import { typography } from './typography';
import { spacing, borderRadius, shadows } from './spacing';

export interface Theme {
  mode: 'light' | 'dark';
  colors: ColorScheme;
  typography: typeof typography;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
  shadows: typeof shadows;
}

export function createTheme(mode: 'light' | 'dark'): Theme {
  return {
    mode,
    colors: mode === 'dark' ? darkColors : lightColors,
    typography,
    spacing,
    borderRadius,
    shadows,
  };
}
