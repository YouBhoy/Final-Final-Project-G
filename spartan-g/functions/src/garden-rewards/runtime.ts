import type { DocumentSnapshot, Firestore, Timestamp, Transaction } from 'firebase-admin/firestore';
import { activation } from './eligibility';
import { assertLocalRewardDatabase } from './local-safety';
import { wateringActivation } from '../garden-watering/validation';
export type GardenOperation = 'capture' | 'assessment' | 'recovery' | 'watering';
export interface GardenSubject {
  readonly studentId: string;
  readonly operationId: string;
  readonly attemptCreateTime?: Timestamp;
  readonly submissionTime?: Timestamp;
}
export type GardenAdmission = 'assessment' | 'recovery' | 'watering';
export interface GardenRuntime {
  assertDatabase(db: Firestore): void;
  activation(transaction: Transaction, epoch: DocumentSnapshot, operation: GardenOperation, subject?: GardenSubject): Promise<Timestamp>;
  withAdmission?<T>(db: Firestore, operation: GardenAdmission, studentId: string, work: () => Promise<T>): Promise<T>;
  transaction?<T>(db: Firestore, callback: (transaction: Transaction) => Promise<T>): Promise<T>;
}
export function runGardenTransaction<T>(runtime: GardenRuntime, db: Firestore,
  callback: (transaction: Transaction) => Promise<T>): Promise<T> {
  return runtime.transaction ? runtime.transaction(db, callback) : db.runTransaction(callback);
}
// Existing local callers retain their original fence and immutable-gate behavior.
export const localGardenRuntime: GardenRuntime = {
  assertDatabase: assertLocalRewardDatabase,
  async activation(_transaction, epoch, operation) {
    return operation === 'watering' ? wateringActivation(epoch) : activation(epoch);
  },
};
