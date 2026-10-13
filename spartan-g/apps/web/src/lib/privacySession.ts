const KEY = 'spartan-g:privacy-session';

// Acceptance belongs to this browser tab's current sign-in, never the account forever.
export function readPrivacySession(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
export function acceptPrivacySession(session: string) {
  try { sessionStorage.setItem(KEY, session); } catch { /* In-memory consent still works. */ }
}
export function clearPrivacySession() {
  try { sessionStorage.removeItem(KEY); } catch { /* Storage can be disabled. */ }
}
export function privacySessionKey(uid: string, signedInAt: string | undefined) {
  return `${uid}:${signedInAt ?? 'current-session'}`;
}
