import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { calculateWateringReward } from '../garden/policy';
import { parseGardenState } from '../garden/validation';
import { utcDayFromDate } from '../garden/dates';
import { localGardenRuntime, runGardenTransaction, type GardenRuntime } from '../garden-rewards/runtime';
import { WATERING_PATHS, WateringError, type WateringDayClaim, type WateringIdentity,
  type WateringReceipt, type WateringResponse } from './contracts';
import { authenticatedStudentId, gardenDocument, readDayClaim, readWateringReceipt, reject,
  requestId, verifyStudent, wateringDayId, wateringOperationId } from './validation';

/** Trusted processor. The injectable server clock is never callable input. */
export class GardenWateringProcessor {
  constructor(private readonly db: Firestore, private readonly clock: () => Date = () => new Date(),
    private readonly runtime: GardenRuntime = localGardenRuntime) {
    runtime.assertDatabase(db);
  }

  async water(authenticatedUid: unknown, input: unknown): Promise<WateringResponse> {
    this.runtime.assertDatabase(this.db);
    const uid = authenticatedStudentId(authenticatedUid);
    const id = requestId(input);
    const instant = this.clock();
    if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) {
      throw new WateringError('unavailable', 'server_clock_unavailable', true);
    }
    // Pin one trusted request instant across automatic transaction retries.
    const requestedAt = Timestamp.fromDate(instant);
    const day = utcDayFromDate(instant);
    const key = wateringOperationId(uid, id);
    const who: WateringIdentity = { kind: 'watering', studentId: uid, requestId: id };
    return runGardenTransaction(this.runtime, this.db, async transaction => {
      const [control, user, gardenDoc, receiptDoc] = await transaction.getAll(
        this.db.doc(WATERING_PATHS.control), this.db.doc(`users/${uid}`),
        this.db.doc(`student_gardens/${uid}`), this.db.doc(`${WATERING_PATHS.receipts}/${key}`),
      );
      if (!control || !user || !gardenDoc || !receiptDoc) throw new Error('Incomplete transaction snapshot set');
      verifyStudent(user.data(), uid);
      const cutoff = await this.runtime.activation(transaction, control, 'watering', { studentId: uid, operationId: key });
      if (!gardenDoc.exists) reject('garden_unavailable', 'not-found');
      const garden = gardenDocument(gardenDoc.data(), uid);
      if (receiptDoc.exists) {
        const receipt = readWateringReceipt(receiptDoc.data(), who, cutoff);
        if (receipt.status === 'applied') {
          const claimDoc = await transaction.get(this.db.doc(
            `${WATERING_PATHS.receipts}/${wateringDayId(uid, receipt.rewardDay)}`,
          ));
          const claim = readDayClaim(claimDoc.data(), uid, receipt.rewardDay, cutoff);
          if (claim.operationId !== key) reject('receipt_conflict');
        }
        return { status: 'replayed', requestId: id, result: receipt.result };
      }
      // Never move a future/corrupt or out-of-order daily marker backwards.
      if (garden.lastWateredDate > day) reject('garden_date_ahead_requires_review');
      const guardId = wateringDayId(uid, day);
      const claimDoc = await transaction.get(this.db.doc(`${WATERING_PATHS.receipts}/${guardId}`));
      if (claimDoc.exists) {
        readDayClaim(claimDoc.data(), uid, day, cutoff);
        if (garden.lastWateredDate !== day) reject('watering_history_conflict');
      }
      let result;
      try { result = calculateWateringReward(garden, instant); }
      catch { return reject('invalid_garden'); }
      const common = { schemaVersion: 1 as const, operationId: key, identity: who, policyVersion: 'legacy-v1' as const,
        rewardDay: day, requestedAt, activationAt: cutoff, before: parseGardenState(garden, uid), recordedAt: Timestamp.now() };
      let receipt: WateringReceipt;
      if (result.status === 'rewarded') {
        const claim: WateringDayClaim = { schemaVersion: 1, kind: 'watering_day', guardId, studentId: uid, day,
          operationId: key, requestId: id, policyVersion: 'legacy-v1', activationAt: cutoff, recordedAt: Timestamp.now() };
        // Only watering fields change. Seeds, streaks, dates and legacy metadata survive.
        transaction.update(gardenDoc.ref, { xp: result.garden.xp, level: result.garden.level,
          lastWateredDate: day, updatedAt: FieldValue.serverTimestamp() });
        transaction.create(claimDoc.ref, { ...claim, recordedAt: FieldValue.serverTimestamp() });
        receipt = { ...common, status: 'applied', result };
      } else {
        receipt = { ...common, status: 'already_watered', result };
      }
      transaction.create(receiptDoc.ref, { ...receipt, recordedAt: FieldValue.serverTimestamp() });
      // runTransaction resolves only after these writes commit together.
      return { status: result.status === 'rewarded' ? 'rewarded' : 'already_watered', requestId: id, result };
    });
  }
}
