import { useState, useCallback, useEffect, useRef } from 'react';
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
  Keyboard,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextInputFocusEventData,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MobileAuthStackParamList } from '@spartan-g/shared-types';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@spartan-g/shared-services';
import { lightColors } from '@spartan-g/shared-ui';
import { DEFAULT_PRIVACY_POLICY } from '../../security/policy-default';
import { loginPrivacyHandoff } from '../../security/login-privacy';
import { currentPolicyActor } from '../../security/portal-policy';
import { LoginLegalDocument, type LoginLegalDocumentKind } from './LoginLegalDocument';

type Props = NativeStackScreenProps<MobileAuthStackParamList, 'Login'>;

const HERO_RATIO = 0.42; // Hero takes 42% of screen height

function HeroGradientOverlay() {
  // Creates a smooth fade from semi-transparent dark at the bottom to fully transparent
  // where the hero image meets the white card
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
      {/* Extra bottom strip for a clean fade edge */}
      <View
        style={{
          position: 'absolute',
          bottom: stripCount * stripHeight - 1,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: 'transparent',
        }}
      />
    </>
  );
}

export function LoginScreen({ navigation }: Props) {
  const signIn = useAuthStore((s) => s.signIn);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const agreement = useRef(false);
  const [document, setDocument] = useState<LoginLegalDocumentKind | null>(null);
  const documentRef = useRef<LoginLegalDocumentKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false), mounted = useRef(true);
  const { height } = useWindowDimensions();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const isLoading = status === 'loading' || submitting;

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
    if (!agreement.current) errors.agreement = 'Please read and agree to the Privacy Policy before signing in.';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [email, password]);

  const handleSubmit = useCallback(async () => {
    // Keyboard submission and stale/rapid presses must obey the same guard.
    if (submittingRef.current || status === 'loading' || documentRef.current !== null) return;
    clearError();
    if (!validate()) return;
    submittingRef.current = true; setSubmitting(true);
    const acknowledgement = loginPrivacyHandoff.begin(DEFAULT_PRIVACY_POLICY);
    try {
      await signIn({ email: email.trim(), password });
      // Bind only to the actual successful Firebase/app session. The post-login
      // gate still verifies the server document and persists the existing receipt.
      const state = useAuthStore.getState();
      const samePasswordSession = state.status === 'authenticated' && state.sessionOrigin === 'password'
        && state.credentialProof?.session === state.session
        && state.session?.email?.toLowerCase() === email.trim().toLowerCase();
      acknowledgement.complete(samePasswordSession ? currentPolicyActor() : null);
    } catch {
      acknowledgement.cancel();
      // Error is set in the auth store
    } finally {
      submittingRef.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }, [email, password, validate, signIn, clearError, status]);

  const toggleAgreement = () => {
    if (isLoading || submittingRef.current) return;
    agreement.current = !agreement.current; setAgreed(agreement.current);
    setFormErrors(previous => { const next = { ...previous }; delete next.agreement; return next; });
  };
  const openDocument = (kind: LoginLegalDocumentKind) => {
    if (isLoading || submittingRef.current || documentRef.current) return;
    Keyboard.dismiss(); documentRef.current = kind; setDocument(kind);
  };
  const closeDocument = () => { documentRef.current = null; setDocument(null); };

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

  const heroHeight = Math.max(280, Math.min(height * HERO_RATIO, 420));

  // Scrolls the focused field comfortably above the keyboard (~120px of
  // breathing room below it) so it never sits at the very edge. On Android we
  // wait a beat so windowSoftInputMode="adjustResize" finishes resizing the
  // window before the field's position is measured.
  const scrollViewRef = useRef<ScrollView>(null);

  const scrollToFocusedField = useCallback(
    (e: NativeSyntheticEvent<TextInputFocusEventData>) => {
      const node = e.nativeEvent.target;
      const responder = scrollViewRef.current?.getScrollResponder() as
        | {
            scrollResponderScrollNativeHandleToKeyboard?: (
              node: number,
              extraHeight?: number,
              preventNegativeScrollOffset?: boolean,
            ) => void;
          }
        | undefined;
      const scrollToKeyboard =
        responder?.scrollResponderScrollNativeHandleToKeyboard;
      if (node == null || !scrollToKeyboard) return;
      const scroll = () => scrollToKeyboard(node, 120, true);
      if (Platform.OS === 'android') {
        setTimeout(scroll, 100);
      } else {
        scroll();
      }
    },
    [],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      // iOS: pad the layout up by the keyboard height. Android: the manifest's
      // windowSoftInputMode="adjustResize" already resizes the window — adding
      // behavior="height" here shrank it twice and pushed the fields under the
      // keyboard, so Android passes through (behavior undefined).
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        importantForAccessibility={document ? 'no-hide-descendants' : 'auto'}
      >
        {/* ─── Hero Image Section (full-bleed) ──────────────── */}
        <View style={[styles.heroContainer, { height: heroHeight }]}>
          <Image
            source={require('../../../assets/bsu cover for app new.png')}
            style={styles.heroImage}
            resizeMode="cover"
          />
          {/* Gradient fade at bottom edge */}
          <HeroGradientOverlay />

          {/* Overlay content — logo + heading */}
          <View style={styles.heroOverlay}>
            {/* Logo with white circular backing */}
            <View style={styles.heroLogoContainer}>
              <Image
                source={require('../../../assets/icon.png')}
                style={styles.heroLogoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.heroBrandLabel}>SPARTAN-G</Text>
            <Text style={styles.heroBrandSubLabel}>Mental Health App</Text>
            <Text style={styles.heroTitle}>Welcome back</Text>
            <Text style={styles.heroSubtitle}>Sign in to your SPARTAN-G account</Text>
          </View>
        </View>

        {/* ─── White Rounded Card (form) ───────────────────── */}
        <View style={styles.formCard}>
          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="assertive">
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
                testID="login-email"
                accessibilityLabel="Email"
                onFocus={scrollToFocusedField}
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
                  testID="login-password"
                  accessibilityLabel="Password"
                  returnKeyType="go"
                  onSubmitEditing={() => void handleSubmit()}
                  numberOfLines={1}
                  onFocus={scrollToFocusedField}
                  editable={!isLoading}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((prev) => !prev)}
                  hitSlop={8}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={lightColors.textMuted}
                  />
                </Pressable>
              </View>
              {formErrors.password && (
                <Text style={styles.fieldError}>{formErrors.password}</Text>
              )}
            </View>

            <View style={styles.agreementSection}>
              <View style={styles.agreementRow}>
                <Pressable testID="login-privacy-checkbox" accessibilityRole="checkbox"
                  accessibilityLabel="I have read and agree to the Privacy Policy."
                  accessibilityState={{ checked: agreed, disabled: isLoading }}
                  disabled={isLoading} onPress={toggleAgreement} style={styles.checkboxTarget}>
                  <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                    {agreed && <Feather name="check" size={17} color="#FFFFFF" />}
                  </View>
                </Pressable>
                <Pressable testID="login-privacy-link" accessibilityRole="link" accessibilityLabel="Read Privacy Policy"
                  accessibilityState={{ disabled: isLoading }} disabled={isLoading}
                  onPress={() => openDocument('privacy')} style={styles.privacyLinkTarget}>
                  <Text style={styles.agreementText}>I have read and agree to the{' '}
                    <Text style={styles.legalLink}>Privacy Policy</Text>.
                  </Text>
                </Pressable>
              </View>
              {!!formErrors.agreement && <Text testID="login-agreement-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.fieldError}>{formErrors.agreement}</Text>}
              <Pressable testID="login-terms-link" accessibilityRole="link" accessibilityLabel="Terms of Use, pending approval"
                accessibilityState={{ disabled: isLoading }} disabled={isLoading} onPress={() => openDocument('terms')} style={styles.termsLinkTarget}>
                <Text style={styles.pendingTerms}>Terms of Use · pending approval</Text>
              </Pressable>
            </View>

            {/* Only the existing Privacy Policy is required; Terms are not approved. */}
            <TouchableOpacity
              testID="login-submit"
              onPress={handleSubmit}
              style={[styles.submitButton, (isLoading || !agreed) && styles.submitButtonDisabled]}
              disabled={isLoading || !agreed || document !== null}
              accessibilityRole="button"
              accessibilityLabel="Log In"
              accessibilityHint={!agreed ? 'Agree to the Privacy Policy to enable login' : undefined}
              accessibilityState={{ disabled: isLoading || !agreed || document !== null, busy: isLoading }}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Log In</Text>
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
        </View>
      </ScrollView>
      <LoginLegalDocument document={document} onClose={closeDocument} />
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
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
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
    // Fixed height: single-line inputs must never grow vertically (e.g. long
    // passwords). Text scrolls horizontally inside instead of wrapping.
    height: 48,
    fontSize: 15,
    color: lightColors.text,
  },
  passwordInputWrapper: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 44,
    textAlignVertical: 'center',
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
  inputError: {
    borderColor: lightColors.error,
  },
  fieldError: {
    fontSize: 12,
    color: lightColors.error,
    marginTop: 4,
  },
  agreementSection: { marginTop: 2, marginBottom: 12 },
  agreementRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checkboxTarget: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 23, height: 23, borderRadius: 5, borderWidth: 1.5, borderColor: lightColors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  checkboxChecked: { backgroundColor: lightColors.primary },
  privacyLinkTarget: { flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: 9 },
  agreementText: { fontSize: 14, lineHeight: 23, color: lightColors.textSecondary },
  legalLink: { color: lightColors.primary, fontWeight: '700', textDecorationLine: 'underline' },
  termsLinkTarget: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 8 },
  pendingTerms: { fontSize: 13, color: lightColors.textSecondary, textDecorationLine: 'underline' },
  submitButton: {
    backgroundColor: lightColors.primary,
    borderRadius: 28,
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
    flexWrap: 'wrap',
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
