import { useContext } from 'react';

import { ThemeContext, Theme } from '@/theme';

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return theme;
}
