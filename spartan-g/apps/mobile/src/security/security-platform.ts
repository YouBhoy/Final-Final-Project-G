import type { LockPorts } from './app-lock-core';
/** Non-native builds retain normal authentication; no cosmetic biometric support. */
export const platformSecurity = {
  native: false,
  trace: (_event: string, _data?: Record<string, string | boolean | number>) => {},
  read: async () => null,
  write: async () => { throw new Error('Strong native biometric protection is unavailable on this platform.'); },
  remove: async () => {},
  capability: async () => ({ available: false, reason: 'Strong native biometric protection is unavailable on this platform.' }),
  shield: async () => {},
  newInstallationId: () => '00000000-0000-4000-8000-000000000000',
} satisfies Pick<LockPorts, 'read' | 'write' | 'remove' | 'capability' | 'shield' | 'newInstallationId' | 'trace'> & { native: boolean };
