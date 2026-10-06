import {
  View,
  Text,
  TextInput,
  TextInputProps,
  StyleSheet,
} from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';

interface AuthInputProps extends TextInputProps {
  label: string;
  error?: string;
}

export function AuthInput({ label, error, ...props }: AuthInputProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        placeholderTextColor={lightColors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: 6,
  },
  input: {
    height: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    fontSize: 16,
    color: lightColors.text,
  },
  inputError: {
    borderColor: lightColors.error,
  },
    error: {
    fontSize: 12,
    color: lightColors.error,
    marginTop: 4,
  },
});
