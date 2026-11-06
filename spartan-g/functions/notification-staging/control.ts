import { createHash } from 'node:crypto';
import type { PushStore } from '../../services/student-support/notification-runtime';

export const PROJECT = 'spartan-g-assessment-staging' as const;
export const CONTROL = 'notification_rate_limits/staging_delivery_control';
export const recipientHash = (uid: string) => createHash('sha256').update(PROJECT + ':' + uid).digest('hex');
/** No default record is created. Missing, malformed, expired and paused controls fail closed. */
export function createStagingControl(store: PushStore, now = Date.now) {
  function valid(row: Record<string, any> | null, uid: string): row is Record<string, any> {
    return !!row && row.project === PROJECT && row.enabled === true && /^[A-Za-z0-9_-]{1,128}$/.test(uid)
      && Number.isSafeInteger(row.startedAt) && row.startedAt <= now() && now() < row.expiresAt
      && Number.isSafeInteger(row.expiresAt) && row.expiresAt - row.startedAt > 0 && row.expiresAt - row.startedAt <= 1800000
      && Array.isArray(row.recipientHashes) && row.recipientHashes.length > 0 && row.recipientHashes.length <= 3
      && row.recipientHashes.every((h: unknown) => typeof h === 'string' && /^[a-f0-9]{64}$/.test(h)) && row.recipientHashes.includes(recipientHash(uid))
      && Number.isSafeInteger(row.visibleRemaining) && row.visibleRemaining >= 0 && row.visibleRemaining <= 30
      && Number.isSafeInteger(row.proofRemaining) && row.proofRemaining >= 0 && row.proofRemaining <= 10;
  }
  return {
    async allow(uid: string) { return valid(await store.get(CONTROL), uid); },
    /** Budget debit and durable intent are one transaction; no network call inside a callback. */
    async reserveAttempt(uid: string, kind: 'proof' | 'visible', path: string) {
      if (!new RegExp('^notification_deliveries/attempt_' + kind + '_[A-Za-z0-9_-]{32,128}$').test(path)) return false;
      const field = kind === 'proof' ? 'proofRemaining' : kind === 'visible' ? 'visibleRemaining' : null;
      if (!field) return false;
      return store.transaction(async tx => {
        const [row, prior] = await Promise.all([tx.get(CONTROL), tx.get(path)]);
        if (prior || !valid(row, uid) || row[field] <= 0) return false;
        tx.set(CONTROL, { ...row, [field]: row[field] - 1 });
        tx.set(path, { kind, recipientHash: recipientHash(uid), outcome: 'prepared', preparedAt: now(), expiresAt: now() + 30 * 86400000 });
        return true;
      });
    },
    async permitSend(uid: string, kind: 'proof' | 'visible') {
      const field = kind === 'proof' ? 'proofRemaining' : kind === 'visible' ? 'visibleRemaining' : null;
      if (!field) return false;
      const claimed = await store.transaction(async tx => {
        const row = await tx.get(CONTROL); if (!valid(row, uid) || row[field] <= 0) return false;
        tx.set(CONTROL, { ...row, [field]: row[field] - 1 }); return true;
      });
      // Re-read the stop switch after the transactional claim, immediately before the provider call.
      return claimed && valid(await store.get(CONTROL), uid);
    },
  };
}
