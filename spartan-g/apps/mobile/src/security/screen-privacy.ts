import { AppState, NativeModules, Platform } from 'react-native';
import { createCapturePolicy } from './screenshot-policy';

let readyGuard = () => false;
export const privateDocumentationBuild = Platform.OS === 'android' && NativeModules?.SpartanSecurityMetadata?.privateDocumentationBuild === true;
let documentationConsent = false;
export const privateDocumentationCapture = () => privateDocumentationBuild && documentationConsent;
const tag = 'spartan-local-app-lock-v1';
export const screenPrivacy = createCapturePolicy(async protectedScreen => {
  if (Platform.OS !== 'android') return;
  const capture = require('expo-screen-capture') as typeof import('expo-screen-capture');
  if (protectedScreen) {
    try { await capture.preventScreenCaptureAsync(tag); }
    catch {
      // Expo records its JS tag before its native Promise resolves. Remove a
      // failed tag so a later explicit retry cannot get a cached false success.
      await capture.allowScreenCaptureAsync(tag).catch(() => {});
      throw new Error('Screen privacy could not be confirmed.');
    }
  }
  else await capture.allowScreenCaptureAsync(tag);
}, () => readyGuard(), privateDocumentationCapture);

export function consentToPrivateDocumentation() {
  if (!privateDocumentationBuild) return false;
  documentationConsent = true;
  void screenPrivacy.refresh().catch(() => {});
  return true;
}
export function revokePrivateDocumentation() {
  documentationConsent = false;
  void screenPrivacy.refresh().catch(() => {});
}

export function installCaptureGuard(guard: () => boolean) {
  readyGuard = guard;
  screenPrivacy.foreground(AppState.currentState === 'active');
  return () => { readyGuard = () => false; void screenPrivacy.refresh().catch(() => {}); };
}
