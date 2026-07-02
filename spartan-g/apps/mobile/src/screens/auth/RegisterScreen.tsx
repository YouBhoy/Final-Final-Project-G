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
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';

type Props = NativeStackScreenProps<MobileAuthStackParamList, 'Register'>;

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function RegisterScreen({ navigation }: Props) {
  const register = useAuthStore((s) => s.register);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [formData, setFormData] = useState<FormState>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const isLoading = status === 'loading';

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email address';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(async () => {
    clearError();
    if (!validate()) return;

    try {
      // Compose displayName from firstName + lastName as the shared auth service expects
      const displayName = `${formData.firstName.trim()} ${formData.lastName.trim()}`;
      // Public registration defaults to student role (matching web behavior).
      // The shared auth service uses ROLES.STUDENT as default when role is omitted.
      await register({
        email: formData.email.trim(),
        password: formData.password,
        displayName,
      });
      // Navigation handled automatically by RootNavigator on session change
    } catch {
      // Error is set in the auth store
    }
  }, [formData, validate, register, clearError]);

  const handleFieldChange = useCallback(
    (field: keyof FormState, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
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
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>SG</Text>
          </View>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Join SPARTAN-G as a student</Text>
        </View>

        {/* Error banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {/* Form */}
        <View style={styles.formSection}>
          {/* Name row */}
          <View style={styles.nameRow}>
            <View style={styles.nameFieldContainer}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={[styles.input, formErrors.firstName ? styles.inputError : null]}
                placeholder="John"
                placeholderTextColor={lightColors.textMuted}
                value={formData.firstName}
                onChangeText={(v) => handleFieldChange('firstName', v)}
                autoCapitalize="words"
                autoComplete="given-name"
                editable={!isLoading}
              />
              {formErrors.firstName && (
                <Text style={styles.fieldError}>{formErrors.firstName}</Text>
              )}
            </View>
            <View style={styles.nameFieldContainer}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={[styles.input, formErrors.lastName ? styles.inputError : null]}
                placeholder="Doe"
                placeholderTextColor={lightColors.textMuted}
                value={formData.lastName}
                onChangeText={(v) => handleFieldChange('lastName', v)}
                autoCapitalize="words"
                autoComplete="family-name"
                editable={!isLoading}
              />
              {formErrors.lastName && (
                <Text style={styles.fieldError}>{formErrors.lastName}</Text>
              )}
            </View>
          </View>

          {/* Email */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, formErrors.email ? styles.inputError : null]}
              placeholder="you@example.com"
              placeholderTextColor={lightColors.textMuted}
              value={formData.email}
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

          {/* Password */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={[styles.input, formErrors.password ? styles.inputError : null]}
              placeholder="At least 6 characters"
              placeholderTextColor={lightColors.textMuted}
              value={formData.password}
              onChangeText={(v) => handleFieldChange('password', v)}
              secureTextEntry
              autoComplete="new-password"
              editable={!isLoading}
            />
            {formErrors.password && (
              <Text style={styles.fieldError}>{formErrors.password}</Text>
            )}
          </View>

          {/* Confirm Password */}
          <View style={styles.fieldContainer}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={[styles.input, formErrors.confirmPassword ? styles.inputError : null]}
              placeholder="Repeat your password"
              placeholderTextColor={lightColors.textMuted}
              value={formData.confirmPassword}
              onChangeText={(v) => handleFieldChange('confirmPassword', v)}
              secureTextEntry
              autoComplete="new-password"
              editable={!isLoading}
            />
            {formErrors.confirmPassword && (
              <Text style={styles.fieldError}>{formErrors.confirmPassword}</Text>
            )}
          </View>

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
              <Text style={styles.submitButtonText}>Create account</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer link */}
        <View style={styles.footerSection}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            disabled={isLoading}
          >
            <Text style={styles.footerLink}>Sign in</Text>
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
    padding: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
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
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    fontSize: 13,
    color: '#B91C1C',
    textAlign: 'center',
  },
  formSection: {
    marginBottom: 24,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  nameFieldContainer: {
    flex: 1,
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
  inputError: {
    borderColor: lightColors.error,
  },
  fieldError: {
    fontSize: 12,
    color: lightColors.error,
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 4,
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
    paddingBottom: 16,
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