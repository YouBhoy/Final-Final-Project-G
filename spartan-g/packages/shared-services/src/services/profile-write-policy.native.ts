import { PermissionError } from '@spartan-g/shared-types';
/** Defense in depth only; Firestore rules remain the actual authorization boundary. */
export function assertProfileWritesSupported(): never {
  throw new PermissionError('Account profile information is read-only in the mobile application.');
}
