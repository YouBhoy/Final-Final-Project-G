// No runtime import of the development contract; Metro selects this for every release.
import type { LocalEmulatorConfig } from './local-emulator-contract';
export const localEmulators: LocalEmulatorConfig = { enabled: false };
