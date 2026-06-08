import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/auth/AuthProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useTheme } from '@/hooks/useTheme';

interface AppProvidersProps {
  children: ReactNode;
}

function StatusBarThemed() {
  const theme = useTheme();
  return <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBarThemed />
          {children}
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
