import { createHash } from 'node:crypto';
import { Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { calculateWateringReward, GARDEN_POLICY } from '../garden/policy';
import { classifyReceipt } from '../garden/operations';
import { parseUtcDay, utcDayFromDate } from '../garden/dates';
import { parseGardenDocument, parseGardenState, parseWateringRequest } from '../garden/validation';
import type { GardenDocument, GardenState, ServerOperation, WateringCalculation } from '../garden/types';
import { activation, activeStudent, documentId } from '../garden-rewards/eligibility';
import { WateringError, type WateringDayClaim, type WateringIdentity, type WateringReceipt } from './contracts';

export function reject(reason: string, code: WateringError['code'] = 'failed-precondition'): never {
  throw new WateringError(code, reason);
}

export function authenticatedStudentId(value: unknown): string {
  try { return documentId(value); }
  catch { return reject('authentication_required', 'unauthenticated'); }
}

export function requestId(value: unknown): string {
  try {
    const { requestId: id } = parseWateringRequest(value);
    // Canonical opaque UUIDv4; do not trim, case-fold, or derive a day/owner from it.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) {
      return reject('invalid_request_id', 'invalid-argument');
    }
    return id;
  } catch { return reject('invalid_request_id', 'invalid-argument'); }
}

function hash(parts: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
export const wateringOperationId = (uid: string, id: string): string => hash(['watering', uid, id]);
export const wateringDayId = (uid: string, day: string): string => hash(['watering_day', uid, parseUtcDay(day)]);

export function verifyStudent(value: unknown, uid: string): void {
  try {
    activeStudent(value);
    const data = value as Record<string, unknown>;
    if (data.uid !== undefined && data.uid !== uid) reject('active_student_required', 'permission-denied');
  } catch { reject('active_student_required', 'permission-denied'); }
}

export function wateringActivation(snapshot: DocumentSnapshot): Timestamp {
  if (!snapshot.exists || snapshot.data()?.enabled !== true) reject('watering_not_enabled');
  try { return activation(snapshot); }
  catch { return reject('invalid_watering_control'); }
}

export function gardenDocument(value: unknown, uid: string): GardenDocument {
  try {
    const garden = parseGardenDocument(value, uid);
    if (!Number.isSafeInteger(garden.level * GARDEN_POLICY.levelThresholdMultiplier)) reject('invalid_garden');
    return garden;
  } catch { return reject('invalid_garden'); }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('receipt_conflict');
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): Timestamp {
  if (!(value instanceof Timestamp)) reject('receipt_conflict');
  return value;
}
const sameGarden = (left: GardenState, right: GardenState): boolean =>
  left.studentId === right.studentId && left.level === right.level && left.xp === right.xp
  && left.seeds === right.seeds && left.streakCount === right.streakCount
  && left.lastCheckInDate === right.lastCheckInDate && left.lastWateredDate === right.lastWateredDate;

/** Decode server history conservatively, without accepting partial/conflicting receipts. */
export function readWateringReceipt(value: unknown, who: WateringIdentity, cutoff: Timestamp): WateringReceipt {
  try {
    const data = object(value);
    const identity = object(data.identity);
    const raw = object(data.result);
    const key = wateringOperationId(who.studentId, who.requestId);
    const requestedAt = timestamp(data.requestedAt);
    const day = utcDayFromDate(requestedAt.toDate());
    const before = parseGardenState(data.before, who.studentId);
    const result = calculateWateringReward(before, requestedAt.toDate());
    const savedGarden = parseGardenState(raw.garden, who.studentId);
    if (data.schemaVersion !== 1 || data.policyVersion !== 'legacy-v1' || data.operationId !== key
        || identity.kind !== 'watering' || identity.studentId !== who.studentId || identity.requestId !== who.requestId
        || data.rewardDay !== day || raw.day !== day || raw.status !== result.status
        || !sameGarden(savedGarden, result.garden) || before.lastWateredDate > day
        || !timestamp(data.activationAt).isEqual(cutoff)) reject('receipt_conflict');
    const common = { schemaVersion: 1 as const, operationId: key, identity: who, policyVersion: 'legacy-v1' as const,
      rewardDay: day, requestedAt, activationAt: cutoff, before, recordedAt: timestamp(data.recordedAt) };
    let receipt: WateringReceipt;
    if (result.status === 'rewarded') {
      if (data.status !== 'applied' || raw.xpAwarded !== result.xpAwarded || raw.seedsAwarded !== 0
          || raw.leveledUp !== result.leveledUp) reject('receipt_conflict');
      receipt = { ...common, status: 'applied', result };
    } else {
      if (data.status !== 'already_watered' || raw.xpAwarded !== undefined
          || raw.seedsAwarded !== undefined || raw.leveledUp !== undefined) reject('receipt_conflict');
      receipt = { ...common, status: 'already_watered', result };
    }
    const operation: ServerOperation = { operationId: key, identity: who, policyVersion: 'legacy-v1', rewardDay: day };
    const disposition = classifyReceipt(operation, receipt);
    if (disposition !== 'replay_applied' && disposition !== 'replay_already_watered') reject('receipt_conflict');
    return receipt;
  } catch { return reject('receipt_conflict'); }
}

export function readDayClaim(value: unknown, uid: string, day: WateringCalculation['day'], cutoff: Timestamp): WateringDayClaim {
  try {
    const data = object(value);
    const id = requestId({ requestId: data.requestId });
    if (data.schemaVersion !== 1 || data.kind !== 'watering_day' || data.studentId !== uid
        || data.policyVersion !== 'legacy-v1' || data.day !== day || data.guardId !== wateringDayId(uid, day)
        || data.operationId !== wateringOperationId(uid, id) || !timestamp(data.activationAt).isEqual(cutoff)) {
      reject('receipt_conflict');
    }
    return { schemaVersion: 1, kind: 'watering_day', guardId: wateringDayId(uid, day), studentId: uid,
      day, operationId: wateringOperationId(uid, id), requestId: id, policyVersion: 'legacy-v1',
      activationAt: cutoff, recordedAt: timestamp(data.recordedAt) };
  } catch { return reject('receipt_conflict'); }
}
