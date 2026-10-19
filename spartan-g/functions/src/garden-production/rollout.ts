import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { GardenRuntime, GardenSubject } from '../garden-rewards/runtime';
import { activation, activeStudent, sameTime } from '../garden-rewards/eligibility';
import { controlledTransaction } from './transaction';
import { GardenGateError, setGardenSwitch, type GardenSwitch } from './activation';
import { gardenAudit, studentKey, type GardenAuditSink } from './audit';

export const ROLLOUT_PATH = 'garden_rollout/config_v1';
export const allowlistPath = (uid: string): string => `garden_test_allowlist/${studentKey(validUid(uid))}`;
export type SafetyReason = 'rollout_unavailable' | 'not_allowlisted' | 'authorization_expired'
  | 'obsolete_authorization' | 'historical_enrollment' | 'invalid_safety_configuration' | 'rate_limited' | 'concurrency_limited';
export class GardenSafetyError extends Error {
  constructor(readonly reason: SafetyReason, readonly code: 'permission-denied' | 'failed-precondition' | 'resource-exhausted' = 'failed-precondition',
    readonly retryable = false, readonly retryAfterSeconds = 0) { super(`Garden safety: ${reason}`); this.name = 'GardenSafetyError'; }
}
export const safetyError = (error: unknown): boolean => error instanceof GardenSafetyError || error instanceof GardenGateError;
export function validUid(uid: unknown): string {
  if (typeof uid !== 'string' || !uid.length || uid.length > 128 || uid.includes('/') || uid.trim() !== uid) throw new GardenSafetyError('invalid_safety_configuration');
  return uid;
}
const invalid = (): never => { throw new GardenSafetyError('invalid_safety_configuration'); };
export function exact(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== fields.length || !fields.every(key => Object.hasOwn(record, key))) return invalid();
  return record;
}
export function stamp(value: unknown): Timestamp {
  if (!(value instanceof Timestamp) || !Number.isFinite(value.toMillis())) return invalid();
  return value;
}
const revision = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) >= Number.MAX_SAFE_INTEGER) return invalid();
  return Number(value);
};
export const later = (a: Timestamp, b: Timestamp): boolean => a.seconds > b.seconds || (a.seconds === b.seconds && a.nanoseconds > b.nanoseconds);
export function serverNow(clock: () => Date): Timestamp {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return invalid();
  return Timestamp.fromDate(value);
}
interface Rollout {
  enabled: boolean; revision: number; assessmentEpochAt: Timestamp; wateringEpochAt: Timestamp; expiresAt: Timestamp;
}
export function readRollout(snapshot: DocumentSnapshot, now: Timestamp, requireEnabled = true, allowExpired = false): Rollout {
  if (!snapshot.exists || !snapshot.createTime || !snapshot.updateTime || snapshot.ref.path !== ROLLOUT_PATH) throw new GardenSafetyError('rollout_unavailable');
  const data = exact(snapshot.data(), ['schemaVersion', 'mode', 'policyVersion', 'enabled', 'revision', 'assessmentEpochAt', 'wateringEpochAt', 'expiresAt', 'createdAt', 'updatedAt']);
  if (data.schemaVersion !== 1 || data.mode !== 'test_allowlist' || data.policyVersion !== 'legacy-v1' || typeof data.enabled !== 'boolean') return invalid();
  const value = { enabled: data.enabled, revision: revision(data.revision), assessmentEpochAt: stamp(data.assessmentEpochAt),
    wateringEpochAt: stamp(data.wateringEpochAt), expiresAt: stamp(data.expiresAt) };
  stamp(data.createdAt); stamp(data.updatedAt);
  if (!later(value.expiresAt, snapshot.updateTime) || value.expiresAt.toMillis() - snapshot.updateTime.toMillis() > 7 * 86400000) return invalid();
  if (!allowExpired && !later(value.expiresAt, now)) throw new GardenSafetyError('authorization_expired');
  if (requireEnabled && !value.enabled) throw new GardenSafetyError('rollout_unavailable');
  return value;
}
export async function authorizeCohort(tx: Transaction, db: Firestore, uid: string, now: Timestamp,
  epoch: Timestamp, watering = false, subject?: GardenSubject): Promise<void> {
  const [configDoc, memberDoc, otherEpoch] = await tx.getAll(db.doc(ROLLOUT_PATH), db.doc(allowlistPath(uid)),
    db.doc(`garden_reward_control/${watering ? 'assessment' : 'watering'}_v1`));
  if (!configDoc || !memberDoc || !otherEpoch) return invalid();
  const config = readRollout(configDoc, now);
  if (!sameTime(watering ? config.wateringEpochAt : config.assessmentEpochAt, epoch)
      || !sameTime(watering ? config.assessmentEpochAt : config.wateringEpochAt, activation(otherEpoch))) throw new GardenSafetyError('obsolete_authorization');
  if (!memberDoc.exists || !memberDoc.updateTime) throw new GardenSafetyError('not_allowlisted', 'permission-denied');
  const member = exact(memberDoc.data(), ['schemaVersion', 'studentId', 'enabled', 'revision', 'rolloutRevision', 'rolloutUpdateTime', 'expiresAt', 'createdAt', 'updatedAt']);
  if (member.schemaVersion !== 1 || member.studentId !== uid || typeof member.enabled !== 'boolean') return invalid();
  revision(member.revision); stamp(member.createdAt); stamp(member.updatedAt);
  if (!member.enabled) throw new GardenSafetyError('not_allowlisted', 'permission-denied');
  if (member.rolloutRevision !== config.revision || !sameTime(stamp(member.rolloutUpdateTime), stamp(configDoc.updateTime))) throw new GardenSafetyError('obsolete_authorization');
  const expires = stamp(member.expiresAt);
  if (later(expires, config.expiresAt) || !later(expires, memberDoc.updateTime)) return invalid();
  if (!later(expires, now)) throw new GardenSafetyError('authorization_expired');
  // Server metadata, not a backdatable enrollment field. Every enrollment edit starts a new boundary.
  if (subject?.attemptCreateTime && (!later(subject.attemptCreateTime, memberDoc.updateTime)
      || !later(subject.attemptCreateTime, stamp(configDoc.updateTime)))) throw new GardenSafetyError('historical_enrollment');
  if (subject?.submissionTime && (!later(expires, subject.submissionTime) || !later(config.expiresAt, subject.submissionTime))) throw new GardenSafetyError('authorization_expired');
}

async function epochs(tx: Transaction, db: Firestore): Promise<{assessment: Timestamp; watering: Timestamp}> {
  const [a, w] = await tx.getAll(db.doc('garden_reward_control/assessment_v1'), db.doc('garden_reward_control/watering_v1'));
  if (!a || !w) return invalid();
  return { assessment: activation(a), watering: activation(w) };
}
function lease(expiresAt: Timestamp, now: Timestamp): void {
  stamp(expiresAt);
  if (!later(expiresAt, now) || expiresAt.toMillis() - now.toMillis() > 7 * 86400000) return invalid();
}
/** Trusted operator library only; production entry exports none of these management operations. */
export function createGardenOperator(db: Firestore, runtime: GardenRuntime, clock: () => Date = () => new Date(), sink?: GardenAuditSink) {
  runtime.assertDatabase(db);
  return {
    async initialize(expiresAt: Timestamp): Promise<void> {
      runtime.assertDatabase(db);
      lease(expiresAt, serverNow(clock));
      await controlledTransaction(db, async tx => {
        const current = await tx.get(db.doc(ROLLOUT_PATH));
        if (current.exists) return invalid();
        const bound = await epochs(tx, db);
        tx.create(db.doc(ROLLOUT_PATH), {schemaVersion:1, mode:'test_allowlist', policyVersion:'legacy-v1', enabled:false,
          revision:1, assessmentEpochAt:bound.assessment, wateringEpochAt:bound.watering, expiresAt,
          createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp()});
      }, safetyError);
      gardenAudit('operator_rollout', {enabled:false, revision:1}, sink);
    },
    async configure(enabled: boolean, expiresAt: Timestamp, expectedRevision: number): Promise<number> {
      runtime.assertDatabase(db);
      if (typeof enabled !== 'boolean') return invalid(); lease(expiresAt, serverNow(clock));
      const next = await controlledTransaction(db, async tx => {
        const current = await tx.get(db.doc(ROLLOUT_PATH));
        // Operators may renew an expired lease, never change its bound immutable epochs.
        const data = readRollout(current, serverNow(clock), false, true), bound = await epochs(tx, db);
        if (data.revision !== expectedRevision || !sameTime(data.assessmentEpochAt, bound.assessment) || !sameTime(data.wateringEpochAt, bound.watering)) return invalid();
        tx.update(current.ref, {enabled, expiresAt, revision:data.revision + 1, updatedAt:FieldValue.serverTimestamp()});
        return data.revision + 1;
      }, safetyError);
      // Every config edit invalidates old membership bindings. Pause/resume uses existing switches instead.
      gardenAudit('operator_rollout', {enabled, revision:next}, sink); return next;
    },
    async enroll(uidInput: string, enabled: boolean, expiresAt: Timestamp, expectedRevision: number): Promise<number> {
      runtime.assertDatabase(db);
      const uid = validUid(uidInput); if (typeof enabled !== 'boolean') return invalid(); lease(expiresAt, serverNow(clock));
      const next = await controlledTransaction(db, async tx => {
        const [configDoc, member, user] = await tx.getAll(db.doc(ROLLOUT_PATH), db.doc(allowlistPath(uid)), db.doc(`users/${uid}`));
        if (!configDoc || !member || !user) return invalid();
        const config = readRollout(configDoc, serverNow(clock), false), bound = await epochs(tx, db);
        if (!sameTime(config.assessmentEpochAt, bound.assessment) || !sameTime(config.wateringEpochAt, bound.watering) || later(expiresAt, config.expiresAt)) return invalid();
        activeStudent(user.data());
        if (member.exists) {
          const old = exact(member.data(), ['schemaVersion', 'studentId', 'enabled', 'revision', 'rolloutRevision', 'rolloutUpdateTime', 'expiresAt', 'createdAt', 'updatedAt']);
          if (old.studentId !== uid || old.schemaVersion !== 1 || typeof old.enabled !== 'boolean') return invalid();
          stamp(old.rolloutUpdateTime); stamp(old.createdAt); stamp(old.updatedAt); stamp(old.expiresAt); revision(old.rolloutRevision);
        }
        const current = member.exists ? revision(member.data()?.revision) : 0;
        if (current !== expectedRevision) return invalid();
        const value = {schemaVersion:1, studentId:uid, enabled, revision:current + 1, rolloutRevision:config.revision,
          rolloutUpdateTime:stamp(configDoc.updateTime), expiresAt, updatedAt:FieldValue.serverTimestamp()};
        if (member.exists) tx.update(member.ref, value);
        else tx.create(member.ref, {...value, createdAt:FieldValue.serverTimestamp()});
        return current + 1;
      }, safetyError);
      gardenAudit('operator_allowlist', {studentId:uid, enabled, revision:next}, sink); return next;
    },
    async setSwitch(kind: GardenSwitch, enabled: boolean, expectedRevision: number): Promise<number> {
      runtime.assertDatabase(db);
      if (!['assessment', 'recovery', 'watering'].includes(kind)) return invalid();
      const next = await setGardenSwitch(db, runtime, kind, enabled, expectedRevision);
      gardenAudit('operator_switch', {operation:kind, enabled, revision:next}, sink); return next;
    },
  };
}
