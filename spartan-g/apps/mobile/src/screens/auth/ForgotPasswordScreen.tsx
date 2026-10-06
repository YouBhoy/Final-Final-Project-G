import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { useAuthStore } from '@spartan-g/shared-services';
import { AuthInput } from '../../components/ui/AuthInput';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

type Props = NativeStackScreenProps<MobileAuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const status = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const isLoading = status === 'loading';

  const handleReset = async () => {
    clearError();
    setMessage('');
    try {
      await resetPassword(email.trim());
      setMessage('A password reset link has been sent to your email.');
      Alert.alert(
        'Check your email',
        'A password reset link has been sent to your email.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
      );
    } catch {
      // Error is surfaced via the store
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your email and we'll send you a link to reset your password.
        </Text>
      </View>

      <AuthInput
        label="Email"
        placeholder="you@spartang.edu"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        error={authError ?? undefined}
      />

      {message ? <Text style={styles.successText}>{message}</Text> : null}

      <PrimaryButton
        title="Send Reset Link"
        loading={isLoading}
        disabled={!email.trim()}
        onPress={handleReset}
      />

      <TouchableOpacity style={styles.backLink} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>Back to Sign In</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    backgroundColor: lightColors.background,
    gap: 8,
  },
  header: { gap: 8, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: lightColors.text },
  subtitle: { fontSize: 15, color: lightColors.textSecondary, lineHeight: 22 },
  successText: {
    fontSize: 14,
    color: lightColors.success,
    textAlign: 'center',
    marginBottom: 12,
  },
  backLink: { marginTop: 16, alignItems: 'center' },
  link: { fontSize: 14, color: lightColors.primary, fontWeight: '600' },
});