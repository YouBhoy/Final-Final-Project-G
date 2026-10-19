import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type { GardenAdmission, GardenRuntime } from '../garden-rewards/runtime';
import { activeStudent } from '../garden-rewards/eligibility';
import { createControlledGardenRuntime } from './activation';
import { controlledTransaction } from './transaction';
import { authorizeCohort, exact, GardenSafetyError, safetyError, serverNow, validUid } from './rollout';
import { gardenAudit, studentKey } from './audit';

export const GARDEN_REQUEST_LIMITS = Object.freeze({ watering: 12, recovery: 24, assessment: 60 });
export const RATE_WINDOW_MS = 60_000;
export const LEASE_MS = 90_000;
export const MAX_IN_FLIGHT = 2;
export const ratePath = (uid: string, operation: GardenAdmission): string => `garden_rate_limits/${operation}_${studentKey(uid)}`;
interface Lease { id: string; until: number }
interface RateState { schemaVersion: 1; studentKey: string; operation: GardenAdmission; windowStart: number; count: number; leases: Lease[] }
const bad = (): never => { throw new GardenSafetyError('invalid_safety_configuration'); };
function readRate(value: unknown, uid: string, operation: GardenAdmission): RateState {
  const data = exact(value, ['schemaVersion', 'studentKey', 'operation', 'windowStart', 'count', 'leases']);
  if (data.schemaVersion !== 1 || data.studentKey !== studentKey(uid) || data.operation !== operation
      || !Number.isSafeInteger(data.windowStart) || Number(data.windowStart) < 0 || Number(data.windowStart) % RATE_WINDOW_MS !== 0
      || !Number.isSafeInteger(data.count) || Number(data.count) < 0 || Number(data.count) > GARDEN_REQUEST_LIMITS[operation]
      || !Array.isArray(data.leases) || data.leases.length > MAX_IN_FLIGHT) return bad();
  const leases = data.leases.map(value => {
    const item = exact(value, ['id', 'until']);
    if (typeof item.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item.id)
        || !Number.isSafeInteger(item.until) || Number(item.until) < Number(data.windowStart)
        || Number(item.until) > Number(data.windowStart) + RATE_WINDOW_MS + LEASE_MS) return bad();
    return { id:item.id, until:Number(item.until) };
  });
  if (new Set(leases.map(item => item.id)).size !== leases.length) return bad();
  return {schemaVersion:1, studentKey:studentKey(uid), operation, windowStart:Number(data.windowStart), count:Number(data.count), leases};
}
/** New production layer. Existing local/Phase 6A runtimes remain available and fenced. */
export function createSafetyControlledGardenRuntime(assertDatabase: (db: Firestore) => void,
  clock: () => Date = () => new Date()): GardenRuntime {
  const base = createControlledGardenRuntime(assertDatabase);
  const runtime: GardenRuntime = {
    assertDatabase,
    transaction: (db, callback) => controlledTransaction(db, callback, safetyError),
    async activation(tx, epoch, operation, subject) {
      const cutoff = await base.activation(tx, epoch, operation);
      if (!subject || !/^[a-f0-9]{64}$/.test(subject.operationId)
          || (operation !== 'watering' && !(subject.attemptCreateTime instanceof Timestamp))
          || (operation === 'capture' && !(subject.submissionTime instanceof Timestamp))) return bad();
      await authorizeCohort(tx, epoch.ref.firestore, subject.studentId, serverNow(clock), cutoff, operation === 'watering', subject);
      return cutoff;
    },
    async withAdmission(db, operation, uid, work) {
      assertDatabase(db);
      validUid(uid);
      const id = randomUUID();
      await controlledTransaction(db, async tx => {
        const now = serverNow(clock), milliseconds = now.toMillis();
        const epochPath = `garden_reward_control/${operation === 'watering' ? 'watering' : 'assessment'}_v1`;
        const [epoch, user, rate] = await tx.getAll(db.doc(epochPath), db.doc(`users/${uid}`), db.doc(ratePath(uid, operation)));
        if (!epoch || !user || !rate) return bad();
        activeStudent(user.data());
        // Admission does not create proof or reward. Domain transaction rechecks every gate.
        const cutoff = await base.activation(tx, epoch, operation === 'assessment' ? 'capture' : operation);
        await authorizeCohort(tx, db, uid, now, cutoff, operation === 'watering');
        const windowStart = Math.floor(milliseconds / RATE_WINDOW_MS) * RATE_WINDOW_MS;
        const state: RateState = rate.exists ? readRate(rate.data(), uid, operation)
          : {schemaVersion:1, studentKey:studentKey(uid), operation, windowStart, count:0, leases:[]};
        if (state.windowStart > windowStart) return bad();
        const leases = state.leases.filter(item => item.until > milliseconds);
        const count = state.windowStart === windowStart ? state.count : 0;
        if (count >= GARDEN_REQUEST_LIMITS[operation]) throw new GardenSafetyError('rate_limited', 'resource-exhausted', true,
          Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - milliseconds) / 1000)));
        if (leases.length >= MAX_IN_FLIGHT) throw new GardenSafetyError('concurrency_limited', 'resource-exhausted', true,
          Math.max(1, Math.ceil((Math.min(...leases.map(item => item.until)) - milliseconds) / 1000)));
        tx.set(rate.ref, {schemaVersion:1, studentKey:studentKey(uid), operation, windowStart, count:count + 1,
          leases:[...leases, {id, until:milliseconds + LEASE_MS}]});
      }, safetyError);
      try { return await work(); }
      finally {
        // A release failure must not turn a committed reward into a false failure. Lease expiry bounds it.
        try {
          await controlledTransaction(db, async tx => {
            const doc = await tx.get(db.doc(ratePath(uid, operation)));
            if (!doc.exists) return;
            const state = readRate(doc.data(), uid, operation);
            if (state.leases.some(item => item.id === id)) tx.update(doc.ref, {leases:state.leases.filter(item => item.id !== id)});
          }, safetyError);
        } catch { gardenAudit('processing_failed', {operation, studentId:uid, reason:'lease_release_failed'}); }
      }
    },
  };
  return runtime;
}
