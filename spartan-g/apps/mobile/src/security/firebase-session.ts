import type { Auth } from 'firebase/auth';
import type { LockActor } from './app-lock-core';

type CheckCode = 'quick-login/network' | 'quick-login/invalid-session' | 'quick-login/account-changed' | 'quick-login/unavailable';
const failure = (code: CheckCode) => Object.assign(new Error('Firebase session confirmation failed.'), { code });

/** SDK-owned tokens only. No token parsing, logging, persistence or server-revocation claim. */
export function createFirebaseSessionValidator(getAuth: () => Auth, currentActor: () => LockActor | null, timeoutMs = 10_000) {
  return async (actor: LockActor): Promise<void> => {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const binding: unknown = JSON.parse(actor.owner);
      const session = actor.session as { uid?: unknown; role?: unknown } | null;
      if (!Array.isArray(binding) || binding.length !== 3 || typeof binding[0] !== 'string'
        || !['student', 'facilitator'].includes(binding[1]) || typeof binding[2] !== 'string'
        || !binding[2] || session?.uid !== binding[2] || session?.role !== binding[1]) throw failure('quick-login/account-changed');
      const auth = getAuth();
      await auth.authStateReady();
      const user = auth.currentUser;
      const assertCurrent = () => {
        const now = currentActor();
        if (expired) throw failure('quick-login/network');
        if (!user || user.isAnonymous || auth.currentUser !== user || user.uid !== binding[2]
          || auth.app.options.projectId !== binding[0] || now?.owner !== actor.owner || now.session !== actor.session) {
          throw failure('quick-login/account-changed');
        }
      };
      assertCurrent();
      // forceRefresh requires an online backend response even if the cached ID token is unexpired.
      await user!.getIdToken(true);
      assertCurrent();
      await user!.reload();
      assertCurrent();
    };
    try {
      await Promise.race([check(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { expired = true; reject(failure('quick-login/network')); }, timeoutMs);
      })]);
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code?.startsWith('quick-login/')) throw error;
      if (code === 'auth/network-request-failed' || code === 'auth/timeout' || code === 'auth/too-many-requests') throw failure('quick-login/network');
      if (['auth/user-disabled', 'auth/user-not-found', 'auth/user-token-expired', 'auth/invalid-user-token', 'auth/id-token-revoked', 'auth/id-token-expired'].includes(code || '')) throw failure('quick-login/invalid-session');
      throw failure('quick-login/unavailable');
    } finally {
      expired = true;
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
