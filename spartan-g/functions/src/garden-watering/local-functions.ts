import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { assertLocalRewardDatabase } from '../garden-rewards/local-safety';
import { WateringError } from './contracts';
import { GardenWateringProcessor } from './processor';

/** Factory only; deliberately absent from src/index.ts and all mobile code. */
export function createLocalGardenWateringFunction(db: Firestore, serverClock?: () => Date) {
  assertLocalRewardDatabase(db);
  const processor = new GardenWateringProcessor(db, serverClock);
  return onCall({ region: 'us-central1' }, async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in before watering your Garden.',
      { reason: 'authentication_required', retryable: false });
    try {
      return await processor.water(request.auth.uid, request.data);
    } catch (error) {
      if (error instanceof WateringError) {
        throw new HttpsError(error.code, 'Garden watering could not be completed.',
          { reason: error.reason, retryable: error.retryable });
      }
      logger.error('garden_watering_failed', { retryable: true });
      throw new HttpsError('unavailable', 'Watering is temporarily unavailable. Retry with the same requestId.',
        { reason: 'temporary_firestore_failure', retryable: true });
    }
  });
}
