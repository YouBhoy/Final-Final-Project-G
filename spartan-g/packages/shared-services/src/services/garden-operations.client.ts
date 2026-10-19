/** Client acknowledgments only. Reward calculation and authority stay on the server. */
export interface PendingGardenOperations {
  readonly version: 1;
  readonly wateringRequestId?: string;
  readonly assessmentAttemptIds: readonly string[];
}
export interface GardenPendingStorage {
  read(uid: string): Promise<PendingGardenOperations | null>;
  write(uid: string, value: PendingGardenOperations): Promise<void>;
}
export interface GardenOperationStatus {
  readonly wateringPending: boolean;
  readonly pendingAssessmentCount: number;
  readonly waterMessage: string;
  readonly assessmentMessage: string;
}
export type GardenConfirmation = { readonly status: 'confirmed' | 'already' | 'pending' | 'blocked'; readonly message: string };
const emptyStatus: GardenOperationStatus = Object.freeze({ wateringPending: false, pendingAssessmentCount: 0,
  waterMessage: '', assessmentMessage: '' });
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function validatePendingOperations(value: unknown): PendingGardenOperations {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.assessmentAttemptIds)
      || !value.assessmentAttemptIds.every(id => typeof id === 'string' && id.length > 0 && !id.includes('/'))
      || (value.wateringRequestId !== undefined && (typeof value.wateringRequestId !== 'string' || !uuidV4.test(value.wateringRequestId)))) {
    throw new Error('Stored Garden requests need review; they were not reset.');
  }
  return { version: 1, assessmentAttemptIds: [...value.assessmentAttemptIds],
    ...(value.wateringRequestId !== undefined ? { wateringRequestId: value.wateringRequestId } : {}) };
}
function failure(error: unknown, operation: 'watering' | 'assessment'): GardenConfirmation {
  const code = object(error) && typeof error.code === 'string' ? error.code.replace('functions/', '') : 'unavailable';
  const details = object(error) && object(error.details) ? error.details : {};
  if (code === 'unauthenticated' || code === 'permission-denied') return { status: 'blocked', message: 'Sign in with an authorized active student account, then retry.' };
  if (details.reason === 'trusted_submission_witness_required') return { status: 'pending', message: 'Assessment saved. Garden reward pending confirmation; retry shortly.' };
  if (['invalid-argument', 'not-found', 'failed-precondition', 'already-exists'].includes(code)) {
    return { status: 'blocked', message: `${operation === 'assessment' ? 'Assessment saved. Reward' : 'Watering'} needs review (${typeof details.reason === 'string' ? details.reason : code}). No reward is confirmed.` };
  }
  return { status: 'pending', message: operation === 'assessment'
    ? 'Assessment saved. Garden reward pending; retry when the backend is available.'
    : 'Watering is not confirmed. Check the connection and retry the same request.' };
}

export class GardenOperationsClient {
  private readonly listeners = new Set<() => void>();
  private readonly statuses = new Map<string, GardenOperationStatus>();
  private readonly writes = new Map<string, Promise<unknown>>();
  private readonly flights = new Map<string, Promise<GardenConfirmation>>();
  constructor(private readonly dependencies: {
    storage: GardenPendingStorage;
    requestId(): string;
    currentUid(): string | undefined;
    invoke(name: 'waterGarden' | 'recoverAssessmentReward', data: Readonly<Record<string, string>>): Promise<unknown>;
  }) {}
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getStatus = (uid: string): GardenOperationStatus => this.statuses.get(uid) ?? emptyStatus;
  private publish(uid: string, patch: Partial<GardenOperationStatus>): void {
    this.statuses.set(uid, { ...this.getStatus(uid), ...patch });
    this.listeners.forEach(listener => listener());
  }
  private authorize(uid: string): void {
    if (!uid || this.dependencies.currentUid() !== uid) throw Object.assign(new Error('Student session changed.'), { code: 'unauthenticated' });
  }
  private async read(uid: string): Promise<PendingGardenOperations> {
    return validatePendingOperations(await this.dependencies.storage.read(uid) ?? { version: 1, assessmentAttemptIds: [] });
  }
  private update(uid: string, change: (value: PendingGardenOperations) => PendingGardenOperations): Promise<PendingGardenOperations> {
    const operation = (this.writes.get(uid) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      const next = validatePendingOperations(change(await this.read(uid)));
      await this.dependencies.storage.write(uid, next);
      this.publish(uid, { wateringPending: next.wateringRequestId !== undefined, pendingAssessmentCount: next.assessmentAttemptIds.length });
      return next;
    });
    this.writes.set(uid, operation);
    return operation;
  }
  async hydrate(uid: string): Promise<void> {
    this.authorize(uid);
    const pending = await this.read(uid);
    this.publish(uid, { wateringPending: pending.wateringRequestId !== undefined, pendingAssessmentCount: pending.assessmentAttemptIds.length,
      ...(pending.wateringRequestId && !this.getStatus(uid).waterMessage ? { waterMessage: 'An unconfirmed watering request is saved. Retry to confirm it.' } : {}),
      ...(pending.assessmentAttemptIds.length && !this.getStatus(uid).assessmentMessage ? { assessmentMessage: 'Assessment saved. Garden reward pending confirmation.' } : {}) });
  }
  private once(key: string, work: () => Promise<GardenConfirmation>): Promise<GardenConfirmation> {
    const existing = this.flights.get(key);
    if (existing) return existing;
    const promise = work().finally(() => this.flights.delete(key));
    this.flights.set(key, promise);
    return promise;
  }
  water(uid: string): Promise<GardenConfirmation> {
    return this.once(`water:${uid}`, async () => {
      try {
        this.authorize(uid);
        const pending = await this.update(uid, value => value.wateringRequestId ? value
          : { ...value, wateringRequestId: this.dependencies.requestId() });
        const requestId = pending.wateringRequestId;
        if (!requestId) throw new Error('No durable watering request ID.');
        this.authorize(uid);
        const reply = await this.dependencies.invoke('waterGarden', { requestId });
        if (!object(reply) || reply.requestId !== requestId || !['rewarded', 'already_watered', 'replayed'].includes(String(reply.status))
            || !object(reply.result) || typeof reply.result.day !== 'string'
            || !['rewarded', 'already'].includes(String(reply.result.status))
            || (reply.result.status === 'rewarded' && (reply.result.xpAwarded !== 2 || reply.result.seedsAwarded !== 0))) {
          throw new Error('Unrecognized watering acknowledgment.');
        }
        const status = reply.result.status === 'already' ? 'already' : 'confirmed';
        const message = status === 'already' ? `Watering already recorded for ${reply.result.day}; no extra XP.`
          : `Watering confirmed for ${reply.result.day} (+2 XP).`;
        await this.update(uid, value => { const { wateringRequestId: saved, ...rest } = value;
          return saved === requestId ? rest : value; });
        this.publish(uid, { waterMessage: message });
        return { status, message };
      } catch (error) {
        const outcome = failure(error, 'watering'); this.publish(uid, { waterMessage: outcome.message }); return outcome;
      }
    });
  }
  confirmAssessment(uid: string, attemptId: string): Promise<GardenConfirmation> {
    return this.once(`assessment:${uid}:${attemptId}`, async () => {
      try {
        this.authorize(uid);
        await this.update(uid, value => ({ ...value, assessmentAttemptIds: [...new Set([...value.assessmentAttemptIds, attemptId])] }));
        this.publish(uid, { assessmentMessage: 'Assessment saved. Garden reward pending confirmation.' });
        this.authorize(uid);
        const reply = await this.dependencies.invoke('recoverAssessmentReward', { attemptId });
        if (!object(reply) || reply.attemptId !== attemptId || !['applied', 'already_applied'].includes(String(reply.status))
            || !object(reply.result) || reply.result.xpAwarded !== 10 || reply.result.seedsAwarded !== 5) {
          throw new Error('Unrecognized assessment reward acknowledgment.');
        }
        await this.update(uid, value => ({ ...value, assessmentAttemptIds: value.assessmentAttemptIds.filter(id => id !== attemptId) }));
        const outcome = { status: 'confirmed' as const, message: 'Garden reward confirmed (+10 XP, +5 seeds).' };
        this.publish(uid, { assessmentMessage: outcome.message }); return outcome;
      } catch (error) {
        const outcome = failure(error, 'assessment'); this.publish(uid, { assessmentMessage: outcome.message }); return outcome;
      }
    });
  }
  async retryAssessments(uid: string): Promise<void> {
    this.authorize(uid);
    for (const id of (await this.read(uid)).assessmentAttemptIds) await this.confirmAssessment(uid, id);
  }
}
