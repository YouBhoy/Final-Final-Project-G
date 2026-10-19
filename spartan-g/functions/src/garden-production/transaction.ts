import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { AssessmentRewardError } from '../garden-rewards/contracts';
import { WateringError } from '../garden-watering/contracts';
import { GardenValidationError } from '../garden/validation';

/**
 * The locked Firestore SDK rolls back asynchronously when the callback throws.
 * A Functions worker can pause before that rollback releases its read locks.
 * Commit known *read-only* rejections before responding; never commit staged writes
 * on an error. Unexpected infrastructure failures still use SDK abort/retry behavior.
 */
export async function controlledTransaction<T>(db: Firestore, callback: (transaction: Transaction) => Promise<T>,
  gateError: (error: unknown) => boolean): Promise<T> {
  const result = await db.runTransaction(async transaction => {
    let staged = false;
    const monitored = new Proxy(transaction, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value !== 'function') return value;
        if (['create', 'update', 'set', 'delete'].includes(String(property))) {
          return (...args: unknown[]) => { staged = true; return Reflect.apply(value, target, args); };
        }
        return value.bind(target);
      },
    });
    try { return { ok: true as const, value: await callback(monitored) }; }
    catch (error) {
      if (staged || !(gateError(error) || error instanceof AssessmentRewardError
          || error instanceof WateringError || error instanceof GardenValidationError)) throw error;
      return { ok: false as const, error };
    }
  });
  if (!result.ok) throw result.error;
  return result.value;
}
