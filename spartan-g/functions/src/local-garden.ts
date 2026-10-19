/** Emulator entry point only. The production package main remains lib/index.js. */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { LOCAL_REWARD_PROJECT } from './garden-rewards/contracts';
import { createLocalAssessmentRewardFunctions } from './garden-rewards/local-functions';
import { createLocalGardenWateringFunction } from './garden-watering/local-functions';
import { onRequest } from 'firebase-functions/v2/https';

if (process.env.FUNCTIONS_EMULATOR !== 'true'
    || process.env.GCLOUD_PROJECT !== LOCAL_REWARD_PROJECT
    || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')
    || !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '')) {
  throw new Error('The Garden local entry point requires all three synthetic emulators.');
}
// The CLI normally skips callable token validation. Exercise Admin verification
// against Auth-emulator tokens instead (unsigned local tokens, never production IAM).
process.env.FIREBASE_DEBUG_FEATURES = JSON.stringify({ skipTokenVerification: false, enableCors: true });
const db = getFirestore(initializeApp({ projectId: LOCAL_REWARD_PROJECT }));
const rewards = createLocalAssessmentRewardFunctions(db);
export const assessmentSubmitted = rewards.assessmentSubmitted;
export const recoverAssessmentReward = rewards.recoverAssessmentReward;
export const waterGarden = createLocalGardenWateringFunction(db);
// Its own emulator worker keeps health independent of a busy/cold transaction.
// No authentication state, student data or Firestore operation is exposed here.
export const gardenLocalHealth = onRequest({ region: 'us-central1' }, (request, response) => {
  if (request.method !== 'GET') { response.status(405).end(); return; }
  response.json({ ready: true, projectId: LOCAL_REWARD_PROJECT, region: 'us-central1' });
});
