// Default/web/server resolution never enables the Android-only test environment.
import type { LocalEmulatorConfig } from './local-emulator-contract';
export const localEmulators: LocalEmulatorConfig = { enabled: false };
