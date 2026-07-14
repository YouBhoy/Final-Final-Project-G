import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Pressable,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';

type Props = NativeStackScreenProps<MobileAuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const signIn = useAuthStore((s) => s.signIn);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);

  const isLoading = status === 'loading';

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Invalid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password]);

  const handleSubmit = useCallback(async () => {
    clearError();
    if (!validate()) return;

    try {
      await signIn({ email: email.trim(), password });
      // Navigation is handled automatically by RootNavigator
      // which checks useAuthStore.session and redirects to the correct navigator
    } catch {
      // Error is set in the auth store
    }
  }, [email, password, validate, signIn, clearError]);

  const handleFieldChange = useCallback(
    (field: 'email' | 'password', value: string) => {
      if (field === 'email') setEmail(value);
      if (field === 'password') setPassword(value);
      if (formErrors[field]) {
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [formErrors],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header with BatStateU seal */}
        <View style={styles.headerSection}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../../../assets/Batangas_State_Logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandLabel}>Student Portal</Text>
          <Text style={styles.brandSubLabel}>Batangas State University</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your SPARTAN-G account</Text>
        </View>

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.formSection}>
          {/* Email field */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, formErrors.email ? styles.inputError : null]}
              placeholder="you@example.com"
              placeholderTextColor={lightColors.textMuted}
              value={email}
              onChangeText={(v) => handleFieldChange('email', v)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              editable={!isLoading}
            />
            {formErrors.email && (
              <Text style={styles.fieldError}>{formErrors.email}</Text>
            )}
          </View>

          {/* Password field */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  formErrors.password ? styles.inputError : null,
                ]}
                placeholder="Enter your password"
                placeholderTextColor={lightColors.textMuted}
                value={password}
                onChangeText={(v) => handleFieldChange('password', v)}
                secureTextEntry={!showPassword}
                autoComplete="password"
                editable={!isLoading}
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={8}
                disabled={isLoading}
              >
                <Text style={styles.eyeIcon}>
                  {showPassword ? '👁‍🗨' : '👁'}
                </Text>
              </Pressable>
            </View>
            {formErrors.password && (
              <Text style={styles.fieldError}>{formErrors.password}</Text>
            )}
          </View>

          {/* Forgot password link */}
          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotPassword}
            disabled={isLoading}
          >
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </TouchableOpacity>

          {/* Submit button */}
          <TouchableOpacity
            onPress={handleSubmit}
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Sign in</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer link */}
        <View style={styles.footerSection}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Register')}
            disabled={isLoading}
          >
            <Text style={styles.footerLink}>Create one</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: lightColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: lightColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    padding: 6,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3.5,
    color: lightColors.primary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  brandSubLabel: {
    fontSize: 12,
    color: lightColors.textSecondary,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: lightColors.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: lightColors.errorBackground,
    borderWidth: 1,
    borderColor: lightColors.errorBorder,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    color: lightColors.errorText,
    textAlign: 'center',
  },
  formSection: {
    marginBottom: 24,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: lightColors.text,
  },
  passwordInputWrapper: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  eyeIcon: {
    fontSize: 20,
  },
  inputError: {
    borderColor: lightColors.error,
  },
  fieldError: {
    fontSize: 12,
    color: lightColors.error,
    marginTop: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.primary,
  },
  submitButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: lightColors.textSecondary,
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '600',
    color: lightColors.primary,
  },
});