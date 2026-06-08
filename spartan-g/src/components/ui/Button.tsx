import {
  Pressable,
  PressableProps,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
} from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const theme = useTheme();

  const sizeStyles: Record<ButtonSize, ViewStyle> = {
    sm: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
    md: { paddingVertical: theme.spacing.sm + 4, paddingHorizontal: theme.spacing.lg },
    lg: { paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.xl },
  };

  const variantStyles: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.colors.primary },
    secondary: { backgroundColor: theme.colors.surfaceElevated },
    outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: theme.colors.error },
  };

  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        sizeStyles[size],
        variantStyles[variant],
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style as ViewStyle,
      ]}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <Text
          variant="button"
          style={{
            color:
              variant === 'primary' || variant === 'danger'
                ? theme.colors.surface
                : theme.colors.text,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { width: '100%' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
