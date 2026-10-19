import * as FileSystem from 'expo-file-system';
import { uuid } from 'expo-modules-core';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { env } from '@spartan-g/shared-services/src/config/env';
import { GARDEN_PRODUCTION_PROJECT, GARDEN_PRODUCTION_REGION, productionGardenEnabled } from '@spartan-g/shared-services/src/config/garden-backend';
import { getFirebaseApp } from '@spartan-g/shared-services/src/firebase/app';
import { getFirebaseAuth } from '@spartan-g/shared-services/src/firebase/auth';
import { GardenOperationsClient, validatePendingOperations } from '@spartan-g/shared-services/src/services/garden-operations.client';
import { installGardenOperations } from '@spartan-g/shared-services/src/services/garden-backend';
let installed = false;
let functions: Functions | undefined;
export function installProductionGardenBackend(): void {
  if (!productionGardenEnabled || installed) return;
  if (env.firebase.projectId !== GARDEN_PRODUCTION_PROJECT) throw new Error('Trusted Garden Firebase project mismatch.');
  const folder = `${FileSystem.documentDirectory}garden-trusted-${GARDEN_PRODUCTION_PROJECT}/`;
  const file = (uid: string) => `${folder}${encodeURIComponent(uid)}.json`;
  const client = new GardenOperationsClient({
    currentUid: () => getFirebaseAuth().currentUser?.uid,
    requestId: () => uuid.v4(),
    storage: {
      async read(uid) {
        if (!FileSystem.documentDirectory) throw new Error('Garden request storage is unavailable.');
        if (!(await FileSystem.getInfoAsync(file(uid))).exists) return null;
        return validatePendingOperations(JSON.parse(await FileSystem.readAsStringAsync(file(uid))));
      },
      async write(uid, value) {
        if (!FileSystem.documentDirectory) throw new Error('Garden request storage is unavailable.');
        await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
        const temporary = `${file(uid)}.tmp`;
        await FileSystem.writeAsStringAsync(temporary, JSON.stringify(value));
        await FileSystem.moveAsync({ from: temporary, to: file(uid) });
      },
    },
    async invoke(name, data) {
      const app = getFirebaseApp();
      const auth = getFirebaseAuth();
      if (app.options.projectId !== GARDEN_PRODUCTION_PROJECT || auth.app !== app || auth.emulatorConfig) {
        throw new Error('Trusted Garden authentication routing mismatch.');
      }
      const instance = functions ?? getFunctions(app, GARDEN_PRODUCTION_REGION);
      // Installed SDK exposes this runtime property; fail closed on missing/changed shape.
      const origin = (instance as Functions & { readonly emulatorOrigin?: string | null }).emulatorOrigin;
      if (instance.app !== app || origin !== null) throw new Error('Trusted Garden Functions routing mismatch.');
      functions = instance;
      return (await httpsCallable<Readonly<Record<string, string>>, unknown>(instance, name, { timeout: 15000 })(data)).data;
    },
  });
  installGardenOperations(client);
  installed = true;
}
