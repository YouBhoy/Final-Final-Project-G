import type { FirebaseApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck, type AppCheck, type AppCheckToken } from 'firebase/app-check';
import { NativeModules, Platform } from 'react-native';
import { localEmulators } from '../config/local-emulators';
import { assertLocalEmulatorsReady } from './local-emulator-state';

// Dormant integration point: the existing release AI resolver remains disabled.
// Production registration, configuration and AI activation require separate approval.
export interface NativeAppCheckConfig {
  provider: 'play-integrity';
  projectId: 'spartan-g-a2d80';
  androidAppId: string;
}

type Reason = 'configuration_missing' | 'local_mode' | 'platform_unavailable'
  | 'app_mismatch' | 'bridge_unavailable' | 'initialization_conflict'
  | 'attestation_unavailable' | 'attestation_timeout' | 'invalid_attestation';

export class AppCheckUnavailableError extends Error {
  constructor(public readonly reason: Reason) {
    super('Secure AI attestation is unavailable.');
    this.name = 'AppCheckUnavailableError';
  }
}

interface NativeBridge {
  getToken(projectId: string, appId: string): Promise<unknown>;
}

type Instance = { appCheck: AppCheck; binding: string };
type AppCheckGlobals = typeof globalThis & {
  __spartanNativeAppCheckV1?: WeakMap<FirebaseApp, Instance>;
};
const instances = (globalThis as AppCheckGlobals).__spartanNativeAppCheckV1
  ??= new WeakMap<FirebaseApp, Instance>();

function unavailable(reason: Reason): never { throw new AppCheckUnavailableError(reason); }

function validateToken(value: unknown, config: NativeAppCheckConfig): AppCheckToken {
  if (typeof value !== 'object' || value === null
      || !('projectId' in value) || value.projectId !== config.projectId
      || !('appId' in value) || value.appId !== config.androidAppId
      || !('token' in value) || typeof value.token !== 'string'
      || value.token.length === 0 || value.token.length > 16384
      || !('expireTimeMillis' in value) || typeof value.expireTimeMillis !== 'number'
      || !Number.isSafeInteger(value.expireTimeMillis)
      || value.expireTimeMillis <= Date.now() + 15000
      || value.expireTimeMillis > Date.now() + 7 * 86400000 + 60000) {
    return unavailable('invalid_attestation');
  }
  // Only the Firebase SDK owns token caching. No custom storage or token logging.
  return { token: value.token, expireTimeMillis: value.expireTimeMillis };
}

function nativeProvider(bridge: NativeBridge, config: NativeAppCheckConfig): CustomProvider {
  let pending: Promise<AppCheckToken> | undefined;
  return new CustomProvider({
    getToken() {
      if (!pending) {
        pending = new Promise<AppCheckToken>((resolve, reject) => {
          // A timeout stops this JS request; native SDK work itself is not cancelable.
          const timer = setTimeout(() => reject(new AppCheckUnavailableError('attestation_timeout')), 30000);
          Promise.resolve().then(() => bridge.getToken(config.projectId, config.androidAppId))
            .then(value => {
              assertLocalEmulatorsReady();
              if (localEmulators.enabled) return unavailable('local_mode');
              return validateToken(value, config);
            })
            .then(resolve, () => reject(new AppCheckUnavailableError('attestation_unavailable')))
            .finally(() => clearTimeout(timer));
        });
        // Coalesce concurrent requests without retaining a completed token ourselves.
        const finished = () => { pending = undefined; };
        void pending.then(finished, finished);
      }
      return pending;
    },
  });
}

/** Initialize before getAI, only in a separately approved AI Logic route. */
export function getNativeAppCheck(app: FirebaseApp, config?: NativeAppCheckConfig): AppCheck {
  assertLocalEmulatorsReady();
  if (localEmulators.enabled) return unavailable('local_mode');
  if (!config || config.provider !== 'play-integrity' || config.projectId !== 'spartan-g-a2d80'
      || typeof config.androidAppId !== 'string' || !/^1:\d+:android:[a-f\d]+$/i.test(config.androidAppId)) {
    return unavailable('configuration_missing');
  }
  if (Platform.OS !== 'android') return unavailable('platform_unavailable');
  // Never silently pair the existing web app identity with native Android attestation.
  if (app.name !== '[DEFAULT]' || app.options.projectId !== config.projectId
      || app.options.appId !== config.androidAppId) return unavailable('app_mismatch');
  const binding = config.projectId + '/' + config.androidAppId;
  const existing = instances.get(app);
  if (existing) {
    if (existing.binding !== binding) return unavailable('initialization_conflict');
    return existing.appCheck;
  }
  const bridge: unknown = NativeModules.SpartanAppCheck;
  if (typeof bridge !== 'object' || bridge === null
      || !('getToken' in bridge) || typeof bridge.getToken !== 'function') {
    return unavailable('bridge_unavailable');
  }
  // Capture a validated, immutable binding; caller mutation cannot redirect attestation.
  const fixed = Object.freeze({ ...config });
  try {
    const appCheck = initializeAppCheck(app, {
      provider: nativeProvider(bridge as NativeBridge, fixed),
      isTokenAutoRefreshEnabled: false,
    });
    instances.set(app, { appCheck, binding });
    return appCheck;
  } catch {
    // Never adopt a pre-existing provider whose trust configuration is unknown.
    return unavailable('initialization_conflict');
  }
}
