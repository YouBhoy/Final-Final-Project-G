import { TextInput, TextInputProps, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...props }: InputProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {label && (
        <Text variant="label" style={{ marginBottom: theme.spacing.xs }}>
          {label}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.error : theme.colors.border,
            color: theme.colors.text,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing.md,
          },
          style,
        ]}
        placeholderTextColor={theme.colors.textMuted}
        {...props}
      />
      {error && (
        <Text variant="caption" color="error" style={{ marginTop: theme.spacing.xs }}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  input: { borderWidth: 1, fontSize: 16 },
});
