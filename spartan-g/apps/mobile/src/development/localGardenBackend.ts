import * as FileSystem from 'expo-file-system';
import { uuid } from 'expo-modules-core';
import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { localEmulators } from '@spartan-g/shared-services/src/config/local-emulators';
import { getFirebaseApp } from '@spartan-g/shared-services/src/firebase/app';
import { getFirebaseAuth } from '@spartan-g/shared-services/src/firebase/auth';
import { assertLocalEmulatorsReady } from '@spartan-g/shared-services/src/firebase/local-emulator-state';
import { GardenOperationsClient, validatePendingOperations } from '@spartan-g/shared-services/src/services/garden-operations.client';
import { installLocalGardenOperations } from '@spartan-g/shared-services/src/services/local-garden-operations';

let installed = false;
let functions: Functions | undefined;
export function installLocalGardenBackend(): void {
  if (!localEmulators.enabled || installed) return;
  const local = localEmulators;
  const folder = `${FileSystem.documentDirectory}garden-local-${local.projectId}/`;
  const file = (uid: string) => `${folder}${encodeURIComponent(uid)}.json`;
  const client = new GardenOperationsClient({
    currentUid: () => getFirebaseAuth().currentUser?.uid,
    requestId: () => uuid.v4(),
    storage: {
      async read(uid) {
        if (!FileSystem.documentDirectory) throw new Error('Local request storage is unavailable.');
        const location = file(uid);
        if (!(await FileSystem.getInfoAsync(location)).exists) return null;
        return validatePendingOperations(JSON.parse(await FileSystem.readAsStringAsync(location)));
      },
      async write(uid, value) {
        if (!FileSystem.documentDirectory) throw new Error('Local request storage is unavailable.');
        await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
        const temporary = `${file(uid)}.tmp`;
        await FileSystem.writeAsStringAsync(temporary, JSON.stringify(value));
        await FileSystem.moveAsync({ from: temporary, to: file(uid) });
      },
    },
    async invoke(name, data) {
      assertLocalEmulatorsReady();
      if (!functions) {
        const instance = getFunctions(getFirebaseApp(), 'us-central1');
        connectFunctionsEmulator(instance, local.host, local.functionsPort);
        functions = instance;
      }
      if (functions.app.name !== local.appName || functions.app.options.projectId !== local.projectId) {
        throw new Error('Local Functions app isolation failed.');
      }
      return (await httpsCallable<Readonly<Record<string, string>>, unknown>(functions, name, { timeout: 15000 })(data)).data;
    },
  });
  installLocalGardenOperations(client);
  installed = true;
}
