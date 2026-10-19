/** Prepared separate entry only. package.json main and notification exports stay unchanged. */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { GARDEN_PRODUCTION_PROJECT, productionGardenRuntime } from './garden-production/runtime';
import { createControlledGardenFunctions } from './garden-production/functions';
const app = initializeApp({ projectId: GARDEN_PRODUCTION_PROJECT }, 'spartan-g-garden-server');
const db = getFirestore(app, '(default)');
productionGardenRuntime.assertDatabase(db);
const handlers = createControlledGardenFunctions(db, productionGardenRuntime);
export const assessmentSubmitted = handlers.assessmentSubmitted;
export const recoverAssessmentReward = handlers.recoverAssessmentReward;
export const waterGarden = handlers.waterGarden;
