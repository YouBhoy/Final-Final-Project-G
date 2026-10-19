// This isolated entry never imports Auth, Firestore, AI, or the application providers.
import { getFirebaseApp } from '../../../../packages/shared-services/src/firebase/app';
import { getNativeAppCheck } from '../../../../packages/shared-services/src/firebase/app-check.native';
import { getToken } from 'firebase/app-check';

export type AttestationResult = 'verified' | 'configuration_unavailable' | 'attestation_unavailable';

export async function performAttestation(): Promise<AttestationResult> {
  if (__DEV__ || process.env.EXPO_PUBLIC_SPARTAN_ATTESTATION_TEST !== 'release-v1') return 'configuration_unavailable';
  try {
    const app = getFirebaseApp();
    if (app.name !== '[DEFAULT]' || app.options.projectId !== 'spartan-g-a2d80'
        || app.options.appId !== '1:250999113503:android:e2cc2c39b6b16decacd22a') return 'configuration_unavailable';
    const check = getNativeAppCheck(app, {
      provider: 'play-integrity', projectId: 'spartan-g-a2d80',
      androidAppId: '1:250999113503:android:e2cc2c39b6b16decacd22a',
    });
    // The native Play Integrity provider performs the genuine exchange; no debug token/fallback.
    // Firebase SDKs own their standard token caches. Never persist/display/log a token here.
    const result = await getToken(check, false);
    // The public SDK rejects errors itself; also refuse any unexpected fallback envelope.
    if ('error' in result || 'internalError' in result || typeof result.token !== 'string' || result.token.length < 100) return 'attestation_unavailable';
    return 'verified';
  } catch {
    return 'attestation_unavailable';
  }
}
