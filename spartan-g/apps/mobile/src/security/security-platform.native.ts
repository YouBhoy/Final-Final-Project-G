import { NativeModules, Platform } from 'react-native';
import { uuid } from 'expo-modules-core';
import type { LockPorts } from './app-lock-core';
import { screenPrivacy } from './screen-privacy';
const store = () => require('expo-secure-store') as typeof import('expo-secure-store');
const biometrics = () => require('expo-local-authentication') as typeof import('expo-local-authentication');
const capture = () => require('expo-screen-capture') as typeof import('expo-screen-capture');
const tag = 'spartan-local-app-lock-v1';
const trace = (event: string, data: Record<string, string | boolean | number> = {}) => {
  // Only an explicitly compiled diagnostic build may cross the trace bridge.
  // Presentation releases have no sink and submit no diagnostic events.
  try {
    const bridge = NativeModules.SpartanBiometricDiagnostic;
    if (bridge?.enabled !== true) return;
    void bridge.record(event, data)?.catch?.(() => {});
  } catch { /* Diagnostics cannot change authentication outcomes. */ }
};
const keyClass = (key: string) => key === 'spartan.local-lock.installation.v1' ? 'installation' : key === 'spartan.after-sign-in.pending.v1' ? 'journal' : key.startsWith('spartan.local-lock.policy.') ? 'lock_policy' : key.startsWith('spartan.after-sign-in.policy.') ? 'after_policy' : key.startsWith('spartan.local-lock.proof.') ? 'lock_proof' : key.startsWith('spartan.after-sign-in.proof.') ? 'after_proof' : 'other';
const options = (biometric: boolean) => ({ keychainService: 'spartan-local-lock-v1', keychainAccessible: store().WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: biometric, authenticationPrompt: 'Verify your biometric to unlock Spartan-G' });
const assertPermit = (authorize?: () => boolean) => {
  if (typeof authorize !== 'function' || authorize() !== true) throw new Error('This fingerprint request expired. No verification was started.');
};
export const platformSecurity = {
  native: true,
  trace,
  async read(key: string, biometric: boolean, authorize?: () => boolean) {
    trace('js_read', { keyClass: keyClass(key), requireAuth: biometric });
    if (biometric) assertPermit(authorize);
    if (biometric && Platform.OS === 'android') {
      const guard = NativeModules.SpartanSecurityMetadata as { assertBiometricProof(key: string): Promise<boolean> } | undefined;
      if (!guard || await guard.assertBiometricProof(key) !== true) throw new Error('Biometric proof is not OS-protected. Sign in normally to re-enroll.');
    }
    if (!biometric && Platform.OS === 'android') {
      // This narrow native reader never invokes authentication or deletes a
      // failed ciphertext. Expo's generic reader may return null after deleting
      // an undecryptable policy, which must not be interpreted as default OFF.
      const guard = NativeModules.SpartanSecurityMetadata as { readPlainMetadata(key: string): Promise<string | null> } | undefined;
      if (!guard || typeof guard.readPlainMetadata !== 'function') throw new Error('Security metadata cannot be verified without prompting.');
      const value = await guard.readPlainMetadata(key);
      if (value !== null && typeof value !== 'string') throw new Error('Security metadata returned an invalid result.');
      return value;
    }
    // The native envelope guard is asynchronous. The account, lock policy or
    // foreground state may have changed while it ran. Check again at dispatch.
    if (biometric) assertPermit(authorize);
    return store().getItemAsync(key, options(biometric));
  },
  async write(key: string, value: string, biometric: boolean, authorize?: () => boolean) {
    trace('js_write', { keyClass: keyClass(key), requireAuth: biometric });
    if (biometric) assertPermit(authorize);
    if (biometric && Platform.OS === 'ios') {
      // Keychain item creation need not prompt on iOS; enrollment must still challenge the OS.
      const result = await biometrics().authenticateAsync({ promptMessage: 'Protect Spartan-G', disableDeviceFallback: true, biometricsSecurityLevel: 'strong', cancelLabel: 'Cancel' });
      if (!result.success) throw new Error('Biometric enrollment was not completed.');
    }
    // Android's biometric CryptoObject write itself prompts with BIOMETRIC_STRONG.
    if (biometric) assertPermit(authorize);
    await store().setItemAsync(key, value, options(biometric));
  },
  async remove(key: string, biometric: boolean) {
    trace('js_delete', { keyClass: keyClass(key), requireAuth: biometric });
    await store().deleteItemAsync(key, options(biometric));
    if (Platform.OS === 'android') {
      const guard = NativeModules.SpartanSecurityMetadata as { assertAbsent(key: string): Promise<boolean> } | undefined;
      if (!guard || await guard.assertAbsent(key) !== true) throw new Error('Local enrollment removal could not be confirmed.');
    }
  },
  async capability() {
    try {
      if (Platform.OS !== 'android') return { available: false, reason: 'Strong local protection for iOS requires separate native installation-binding and privacy validation. Existing iOS sign-in is unchanged.' };
      const local = biometrics();
      if (!await local.hasHardwareAsync()) return { available: false, reason: 'Strong biometric hardware is unavailable on this device.' };
      if (!await local.isEnrolledAsync()) return { available: false, reason: 'Strong biometrics are not enrolled. Enroll a fingerprint in device settings first.' };
      if (await local.getEnrolledLevelAsync() !== local.SecurityLevel.BIOMETRIC_STRONG || !store().canUseBiometricAuthentication()) return { available: false, reason: 'Strong enrolled biometrics are required. Weak face unlock and device PIN fallback are not used.' };
      if (!await capture().isAvailableAsync()) return { available: false, reason: 'Strong local protection requires native screen-privacy support in a separately approved rebuild.' };
      return { available: true };
    } catch { return { available: false, reason: 'Strong biometric modules are unavailable. A separately approved native rebuild is required.' }; }
  },
  async shield(enabled: boolean) {
    // Android's route policy keeps private screens secure even with App Lock
    // OFF, and permits only verified, foreground presentation screens when ON.
    if (Platform.OS === 'android') { await screenPrivacy.refresh(); return; }
    const screen = capture();
    if (enabled) {
      try {
        await screen.preventScreenCaptureAsync(tag);
        if (Platform.OS === 'ios') await screen.enableAppSwitcherProtectionAsync(1);
      } catch (error) { await screen.allowScreenCaptureAsync(tag).catch(() => {}); throw error; }
    } else {
      if (Platform.OS === 'ios') await screen.disableAppSwitcherProtectionAsync();
      await screen.allowScreenCaptureAsync(tag);
    }
  },
  newInstallationId: () => uuid.v4(),
} satisfies Pick<LockPorts, 'read' | 'write' | 'remove' | 'capability' | 'shield' | 'newInstallationId' | 'trace'> & { native: boolean };
