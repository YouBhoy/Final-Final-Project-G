import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { lightColors } from '@spartan-g/shared-ui';
import { useAuthStore } from '@spartan-g/shared-services';
import { AuthInput } from '../../components/ui/AuthInput';
import { PrimaryButton } from '../../components/ui/PrimaryButton';

type Props = NativeStackScreenProps<MobileAuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const signIn = useAuthStore((s) => s.signIn);
  const status = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const isLoading = status === 'loading';

  const handleLogin = async () => {
    clearError();
    try {
      await signIn({ email: email.trim(), password });
    } catch {
      // Error is surfaced via the store
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Sign in to your SPARTAN-G account</Text>
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
      <AuthInput
        label="Password"
        placeholder=""
        secureTextEntry
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        error={authError ?? undefined}
      />

      <PrimaryButton
        title="Sign In"
        loading={isLoading}
        disabled={!email.trim() || !password.trim()}
        onPress={handleLogin}
      />

      <View style={styles.links}>
        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.link}>Forgot your password?</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.link}>Don't have an account? Sign Up</Text>
        </TouchableOpacity>
      </View>
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
  header: {
    gap: 8,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: lightColors.text,
  },
  subtitle: {
    fontSize: 15,
    color: lightColors.textSecondary,
  },
  links: {
    gap: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  link: {
    fontSize: 14,
    color: lightColors.primary,
    fontWeight: '600',
  },
});