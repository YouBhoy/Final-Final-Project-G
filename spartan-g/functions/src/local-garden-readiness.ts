/** Host-only production-policy tests. Never select this entry for deployment. */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { LOCAL_REWARD_PROJECT } from './garden-rewards/contracts';
import { assertLocalRewardDatabase } from './garden-rewards/local-safety';
import { createControlledGardenRuntime } from './garden-production/activation';
import { createControlledGardenFunctions } from './garden-production/functions';
if (process.env.FUNCTIONS_EMULATOR !== 'true' || process.env.GCLOUD_PROJECT !== LOCAL_REWARD_PROJECT
    || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')
    || !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '')) {
  throw new Error('Readiness tests require all three synthetic loopback emulators.');
}
process.env.FIREBASE_DEBUG_FEATURES = JSON.stringify({ skipTokenVerification: false, enableCors: true });
const db = getFirestore(initializeApp({ projectId: LOCAL_REWARD_PROJECT }));
const handlers = createControlledGardenFunctions(db, createControlledGardenRuntime(assertLocalRewardDatabase));
export const assessmentSubmitted = handlers.assessmentSubmitted;
export const recoverAssessmentReward = handlers.recoverAssessmentReward;
export const waterGarden = handlers.waterGarden;
export const gardenLocalHealth = onRequest({ region:'us-central1' }, (request,response) => {
  if (request.method !== 'GET') { response.status(405).end(); return; }
  response.json({ready:true,projectId:LOCAL_REWARD_PROJECT,region:'us-central1'});
});
