import { buildLocalEmulatorConfig } from './local-emulator-contract';

// Static property access is intentional: Expo substitutes EXPO_PUBLIC_* at bundle time.
export const localEmulators = buildLocalEmulatorConfig(
  process.env.EXPO_PUBLIC_SPARTAN_LOCAL_FIREBASE,
  typeof __DEV__ !== 'undefined' && __DEV__,
);
