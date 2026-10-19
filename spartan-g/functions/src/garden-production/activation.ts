import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { activation, sameTime } from '../garden-rewards/eligibility';
import type { GardenOperation, GardenRuntime } from '../garden-rewards/runtime';
import { controlledTransaction } from './transaction';

export const SWITCH_COLLECTION = 'garden_reward_switches';
export type GardenSwitch = 'assessment' | 'watering' | 'recovery';
const epochPath = (kind: GardenSwitch) => `garden_reward_control/${kind === 'watering' ? 'watering' : 'assessment'}_v1`;
export const switchPath = (kind: GardenSwitch) => `${SWITCH_COLLECTION}/${kind}_v1`;
export class GardenGateError extends Error {
  constructor(readonly reason: 'not_activated' | 'paused' | 'invalid_activation' | 'switch_conflict', readonly retryable = false) {
    super(`Garden control: ${reason}`); this.name = 'GardenGateError';
  }
}
interface SwitchState { enabled: boolean; revision: number; epochCreateTime: Timestamp }
function immutableEpoch(snapshot: DocumentSnapshot): Timestamp {
  try { return activation(snapshot); }
  catch { throw new GardenGateError(snapshot.exists ? 'invalid_activation' : 'not_activated'); }
}
function decodeSwitch(snapshot: DocumentSnapshot, cutoff: Timestamp): SwitchState {
  if (!snapshot.exists) throw new GardenGateError('not_activated');
  const value = snapshot.data();
  const fields = ['schemaVersion', 'enabled', 'revision', 'epochCreateTime', 'createdAt', 'updatedAt'];
  if (!value || Object.keys(value).length !== fields.length || !fields.every(key => Object.hasOwn(value, key))
      || value.schemaVersion !== 1 || typeof value.enabled !== 'boolean'
      || !Number.isSafeInteger(value.revision) || value.revision < 1
      || !(value.epochCreateTime instanceof Timestamp) || !sameTime(value.epochCreateTime, cutoff)
      || !(value.createdAt instanceof Timestamp) || !(value.updatedAt instanceof Timestamp)) {
    throw new GardenGateError('invalid_activation');
  }
  return { enabled: value.enabled, revision: value.revision, epochCreateTime: value.epochCreateTime };
}

/** Same transaction reads both epoch and switches, so pause conflicts with reward commits. */
export function createControlledGardenRuntime(assertDatabase: (db: Firestore) => void): GardenRuntime {
  return {
    assertDatabase,
    transaction: (db, callback) => controlledTransaction(db, callback, error => error instanceof GardenGateError),
    async activation(transaction: Transaction, epoch: DocumentSnapshot, operation: GardenOperation) {
      assertDatabase(epoch.ref.firestore);
      const kind = operation === 'watering' ? 'watering' : 'assessment';
      if (epoch.ref.path !== epochPath(kind)) throw new GardenGateError('invalid_activation');
      const cutoff = immutableEpoch(epoch);
      const paths: GardenSwitch[] = operation === 'recovery' ? ['assessment', 'recovery'] : [kind];
      const snapshots = await transaction.getAll(...paths.map(name => epoch.ref.firestore.doc(switchPath(name))));
      if (snapshots.length !== paths.length) throw new GardenGateError('invalid_activation');
      const switches = snapshots.map(snapshot => decodeSwitch(snapshot, cutoff));
      // Preserve trusted submission proof during a pause; never grant rewards here.
      // Missing/invalid epoch/switch still fails closed. Recovery cannot create proof.
      if (operation !== 'capture' && switches.some(state => !state.enabled)) throw new GardenGateError('paused', true);
      return cutoff;
    },
  };
}

/** Trusted operator library only. No callable, trigger, startup invocation or CLI writer. */
export async function initializeGardenSwitch(db: Firestore, runtime: GardenRuntime, kind: GardenSwitch): Promise<void> {
  runtime.assertDatabase(db);
  await controlledTransaction(db, async tx => {
    const [epoch, existing] = await tx.getAll(db.doc(epochPath(kind)), db.doc(switchPath(kind)));
    if (!epoch || !existing) throw new GardenGateError('invalid_activation');
    const cutoff = immutableEpoch(epoch);
    if (existing.exists) throw new GardenGateError('switch_conflict');
    tx.create(existing.ref, { schemaVersion: 1, enabled: false, revision: 1, epochCreateTime: cutoff,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }, error => error instanceof GardenGateError);
}
export async function setGardenSwitch(db: Firestore, runtime: GardenRuntime, kind: GardenSwitch,
  enabled: boolean, expectedRevision: number): Promise<number> {
  runtime.assertDatabase(db);
  if (typeof enabled !== 'boolean' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new GardenGateError('switch_conflict');
  return controlledTransaction(db, async tx => {
    const [epoch, current] = await tx.getAll(db.doc(epochPath(kind)), db.doc(switchPath(kind)));
    if (!epoch || !current) throw new GardenGateError('invalid_activation');
    const state = decodeSwitch(current, immutableEpoch(epoch));
    if (state.revision !== expectedRevision || !Number.isSafeInteger(state.revision + 1)) throw new GardenGateError('switch_conflict');
    tx.update(current.ref, { enabled, revision: state.revision + 1, updatedAt: FieldValue.serverTimestamp() });
    return state.revision + 1;
  }, error => error instanceof GardenGateError);
}
