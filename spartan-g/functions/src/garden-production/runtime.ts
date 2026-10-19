import type { Firestore } from 'firebase-admin/firestore';
import { createSafetyControlledGardenRuntime } from './safety';
export const GARDEN_PRODUCTION_PROJECT = 'spartan-g-a2d80';
export const GARDEN_PRODUCTION_REGION = 'asia-southeast1';
export function assertProductionGardenDatabase(db: Firestore): void {
  const actual = db as Firestore & { readonly projectId?: string; readonly databaseId?: string };
  const emulatorSettings = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FUNCTIONS_EMULATOR',
    'FIREBASE_DATABASE_EMULATOR_HOST', 'FIREBASE_DEBUG_FEATURES'];
  if (actual.projectId !== GARDEN_PRODUCTION_PROJECT || actual.databaseId !== '(default)'
      || process.env.GCLOUD_PROJECT !== GARDEN_PRODUCTION_PROJECT
      || emulatorSettings.some(name => !!process.env[name])
      || (process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== GARDEN_PRODUCTION_PROJECT)) {
    throw new Error('Garden production adapter requires its exact managed project/database and no emulator settings.');
  }
}
export const productionGardenRuntime = createSafetyControlledGardenRuntime(assertProductionGardenDatabase);
