import { Text as RNText, TextProps as RNTextProps, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

type TextVariant = 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label' | 'button';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: 'primary' | 'secondary' | 'muted' | 'error' | 'success';
}

export function Text({ variant = 'body', color = 'primary', style, ...props }: TextProps) {
  const theme = useTheme();

  const colorMap = {
    primary: theme.colors.text,
    secondary: theme.colors.textSecondary,
    muted: theme.colors.textMuted,
    error: theme.colors.error,
    success: theme.colors.success,
  };

  return (
    <RNText
      style={[theme.typography[variant], { color: colorMap[color] }, style]}
      {...props}
    />
  );
}
