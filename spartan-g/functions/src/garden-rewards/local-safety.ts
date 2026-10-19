import type { Firestore } from 'firebase-admin/firestore';
import { LOCAL_REWARD_PROJECT } from './contracts';

/** Deliberate Phase 2 fence. Production use requires a separately reviewed change. */
export function assertLocalRewardDatabase(db: Firestore): void {
  // The locked Firestore SDK has this runtime getter but omits it from its public typings.
  // Missing/different values fail closed; no project-ID discovery/network call is made.
  const projectId = (db as Firestore & { readonly projectId?: string }).projectId;
  if (projectId !== LOCAL_REWARD_PROJECT
      || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')
      || process.env.GCLOUD_PROJECT !== LOCAL_REWARD_PROJECT) {
    throw new Error('Garden Phase 2 is restricted to its synthetic loopback Firestore emulator');
  }
}
