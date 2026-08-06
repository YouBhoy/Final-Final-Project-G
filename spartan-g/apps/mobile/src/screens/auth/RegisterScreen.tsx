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
  Dimensions,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors, palette } from '@spartan-g/shared-ui';

type Props = NativeStackScreenProps<MobileAuthStackParamList, 'Register'>;

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HERO_RATIO = 0.42;

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

function HeroGradientOverlay() {
  const stripCount = 16;
  const stripHeight = 3;
  return (
    <>
      {Array.from({ length: stripCount }).map((_, i) => {
        const opacity = 0.45 - (i / stripCount) * 0.45;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              bottom: i * stripHeight,
              left: 0,
              right: 0,
              height: stripHeight,
              backgroundColor: `rgba(0,0,0,${Math.max(0, opacity)})`,
            }}
          />
        );
      })}
    </>
  );
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      const displayName = `${formData.firstName.trim()} ${formData.lastName.trim()}`;
      await register({
        email: formData.email.trim(),
        password: formData.password,
        displayName,
      });
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

  const heroHeight = SCREEN_HEIGHT * HERO_RATIO;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {/* ─── Hero Image Section (full-bleed) ──────────────── */}
        <View style={[styles.heroContainer, { height: heroHeight }]}>
          <Image
            source={require('../../../assets/bsu cover for app new.png')}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <HeroGradientOverlay />

          {/* Overlay content — logo + heading */}
          <View style={styles.heroOverlay}>
            <View style={styles.heroLogoContainer}>
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.heroLogoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.heroBrandLabel}>SPARTAN-G</Text>
            <Text style={styles.heroBrandSubLabel}>Mental Health App</Text>
            <Text style={styles.heroTitle}>Create your account</Text>
            <Text style={styles.heroSubtitle}>Join SPARTAN-G as a student</Text>
          </View>
        </View>

        {/* ─── White Rounded Card (form) ───────────────────── */}
        <View style={styles.formCard}>
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
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    formErrors.password ? styles.inputError : null,
                  ]}
                  placeholder="At least 6 characters"
                  placeholderTextColor={lightColors.textMuted}
                  value={formData.password}
                  onChangeText={(v) => handleFieldChange('password', v)}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
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

            {/* Confirm Password */}
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    formErrors.confirmPassword ? styles.inputError : null,
                  ]}
                  placeholder="Repeat your password"
                  placeholderTextColor={lightColors.textMuted}
                  value={formData.confirmPassword}
                  onChangeText={(v) => handleFieldChange('confirmPassword', v)}
                  secureTextEntry={!showConfirmPassword}
                  autoComplete="new-password"
                  editable={!isLoading}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                  hitSlop={8}
                  disabled={isLoading}
                >
                  <Text style={styles.eyeIcon}>
                    {showConfirmPassword ? '👁‍🗨' : '👁'}
                  </Text>
                </Pressable>
              </View>
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
  },
  // ─── Hero ────────────────────────────────────────────────
  heroContainer: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
  },
  heroLogoContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  heroLogoImage: {
    width: '100%',
    height: '100%',
  },
  heroBrandLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3.5,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroBrandSubLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 20,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // ─── Form Card ──────────────────────────────────────────
  formCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    flex: 1,
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
  submitButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 28,
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