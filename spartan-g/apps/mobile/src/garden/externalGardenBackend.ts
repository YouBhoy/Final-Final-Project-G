import * as FileSystem from 'expo-file-system';
import { uuid } from 'expo-modules-core';
import { GARDEN_PRODUCTION_PROJECT } from '@spartan-g/shared-services/src/config/garden-backend';
import { getFirebaseAuth } from '@spartan-g/shared-services/src/firebase/auth';
import { GardenOperationsClient, validatePendingOperations } from '@spartan-g/shared-services/src/services/garden-operations.client';
import { ExternalGardenClient, GardenHttpError } from './externalGardenClient';
import { getNativeGardenBridge } from './nativeGardenTransport';

// Requires a separately reviewed source change. No public environment flag enables external routing.
export const EXTERNAL_GARDEN_ROUTING_ENABLED = false;

/** Prepared factory only; intentionally not installed/imported by the current application boundary. */
export function createExternalGardenBackend() {
  if (!EXTERNAL_GARDEN_ROUTING_ENABLED) throw new GardenHttpError('failed-precondition','configuration_disabled');
  const folder = `${FileSystem.documentDirectory}garden-trusted-${GARDEN_PRODUCTION_PROJECT}/`;
  const file = (uid: string) => `${folder}${encodeURIComponent(uid)}.json`;
  const terminals = (uid: string) => `${folder}terminal-holds/${encodeURIComponent(uid)}.json`;
  async function save(target: string, value: unknown) {
    if (!FileSystem.documentDirectory) throw new GardenHttpError('unavailable','storage_unavailable',true);
    await FileSystem.makeDirectoryAsync(target.slice(0,target.lastIndexOf('/')+1),{ intermediates:true });
    await FileSystem.writeAsStringAsync(`${target}.tmp`,JSON.stringify(value));
    await FileSystem.moveAsync({ from:`${target}.tmp`,to:target });
  }
  const terminalWrites = new Map<string,Promise<void>>();
  async function readTerminals(uid: string): Promise<string[]> {
    if (!FileSystem.documentDirectory) throw new GardenHttpError('unavailable','storage_unavailable',true);
    if (!(await FileSystem.getInfoAsync(terminals(uid))).exists) return [];
    const value: unknown = JSON.parse(await FileSystem.readAsStringAsync(terminals(uid)));
    if (!Array.isArray(value) || !value.every(id => typeof id === 'string' && id.length > 0 && !id.includes('/'))) {
      throw new GardenHttpError('failed-precondition','review_required');
    }
    return value;
  }
  const transport = new ExternalGardenClient({ enabled:EXTERNAL_GARDEN_ROUTING_ENABLED,bridge:getNativeGardenBridge(),requestKey:()=>uuid.v4(),
    currentUser() {
      const auth = getFirebaseAuth();
      if (auth.app.options.projectId !== GARDEN_PRODUCTION_PROJECT || auth.emulatorConfig) {
        throw new GardenHttpError('failed-precondition','configuration_disabled');
      }
      return auth.currentUser;
    },
    terminals:{
      read:async(uid,id)=>(await readTerminals(uid)).includes(id),
      write(uid,id) {
        const work = (terminalWrites.get(uid) ?? Promise.resolve()).catch(()=>undefined)
          .then(async()=>save(terminals(uid),[...new Set([...(await readTerminals(uid)),id])]));
        terminalWrites.set(uid,work);return work;
      },
    },
  });
  const operations = new GardenOperationsClient({requestId:()=>uuid.v4(),currentUid:()=>getFirebaseAuth().currentUser?.uid,
    storage:{
      async read(uid) {
        if (!FileSystem.documentDirectory) throw new GardenHttpError('unavailable','storage_unavailable',true);
        if (!(await FileSystem.getInfoAsync(file(uid))).exists) return null;
        return validatePendingOperations(JSON.parse(await FileSystem.readAsStringAsync(file(uid))));
      },
      write:(uid,value)=>save(file(uid),value),
    },
    invoke:(name,data)=>transport.invoke(name,data),
  });
  return { operations,transport }; // No installation, finalization handoff or activation side effects.
}
