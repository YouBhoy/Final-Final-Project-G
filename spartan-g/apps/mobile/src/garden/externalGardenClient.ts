/** Native-only protocol adapter. Never use fetch/XHR as a fallback. No activation side effects. */
export type GardenHttpAction = 'waterGarden' | 'recoverAssessmentReward' | 'finalizeAssessment';
export interface NativeGardenBridge {
  getConfiguration(): Promise<{ version: number; enabled: boolean; origin: string | null }>;
  request(key: string, action: GardenHttpAction, operationId: string, token: string, timeoutMs: number):
    Promise<{ status: number; body: string; retryAfterSeconds: number }>;
  cancel(key: string): Promise<boolean>;
}
export interface GardenTerminalStore {
  read(uid: string, attemptId: string): Promise<boolean>;
  write(uid: string, attemptId: string): Promise<void>;
}
export class GardenHttpError extends Error {
  readonly details: { reason: string; retryable: boolean; outcomeUnknown: boolean };
  constructor(readonly code: string, readonly reason: string, readonly retryable = false,
    readonly outcomeUnknown = false, readonly status = 0, readonly retryAfterSeconds = 0) {
    super('Garden request could not be confirmed.');
    this.details = { reason, retryable, outcomeUnknown };
  }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const reasons = new Set(['configuration_disabled','invalid_origin','invalid_request_key','invalid_timeout','invalid_token',
  'invalid_operation','invalid_identity','request_too_large','transport_closed','request_key_in_use','client_busy',
  'outcome_unknown','cancelled','redirect_rejected','unexpected_destination','invalid_response','response_too_large']);
const codes = new Set(['invalid-argument','unauthenticated','permission-denied','not-found','already-exists',
  'failed-precondition','resource-exhausted','unavailable']);
function nativeFailure(value: unknown): GardenHttpError {
  const info = object(value) && object(value.userInfo) ? value.userInfo : {};
  const reason = typeof info.reason === 'string' && reasons.has(info.reason) ? info.reason : 'outcome_unknown';
  return new GardenHttpError(reason === 'configuration_disabled' ? 'failed-precondition' : 'unavailable', reason,
    reason === 'outcome_unknown' || info.retryable === true, reason === 'outcome_unknown' || info.outcomeUnknown === true);
}

export class ExternalGardenClient {
  private readonly timeoutMs: number;
  constructor(private readonly dependencies: {
    enabled: boolean; bridge: NativeGardenBridge; timeoutMs?: number;
    currentUser(): { uid: string; getIdToken(): Promise<string> } | null;
    requestKey(): string; terminals: GardenTerminalStore;
  }) {
    this.timeoutMs = dependencies.timeoutMs ?? 75000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 90000) {
      throw new GardenHttpError('invalid-argument','invalid_timeout');
    }
  }

  async invoke(action: GardenHttpAction, data: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<unknown> {
    if (!this.dependencies.enabled) throw new GardenHttpError('failed-precondition','configuration_disabled');
    if (!['waterGarden','recoverAssessmentReward','finalizeAssessment'].includes(action)) throw new GardenHttpError('invalid-argument','invalid_operation');
    const field = action === 'waterGarden' ? 'requestId' : 'attemptId';
    if (!object(data) || Object.keys(data).length !== 1 || typeof data[field] !== 'string' || !data[field]) {
      throw new GardenHttpError('invalid-argument','invalid_identity');
    }
    const operationId = data[field]!;
    if (signal?.aborted) throw new GardenHttpError('unavailable','cancelled',true);
    let configuration: Awaited<ReturnType<NativeGardenBridge['getConfiguration']>>;
    try { configuration = await this.dependencies.bridge.getConfiguration(); }
    catch { throw new GardenHttpError('unavailable','native_transport_unavailable',true); }
    // Native owns the destination. This consistency check does not supply a URL to the bridge.
    if (configuration?.version !== 1 || configuration.enabled !== true || typeof configuration.origin !== 'string'
      || !/^https:\/\/(?:\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[1-9][0-9]{0,4})?$/.test(configuration.origin)) {
      throw new GardenHttpError('failed-precondition','configuration_disabled');
    }
    const user = this.dependencies.currentUser();
    if (!user) throw new GardenHttpError('unauthenticated','authentication_required');
    if (field === 'attemptId' && await this.dependencies.terminals.read(user.uid,operationId)) {
      throw new GardenHttpError('failed-precondition','review_required');
    }
    let token: string;
    try { token = await user.getIdToken(); }
    catch { throw new GardenHttpError('unavailable','token_unavailable',true); }
    if (this.dependencies.currentUser()?.uid !== user.uid) throw new GardenHttpError('unauthenticated','session_changed');
    if (signal?.aborted) throw new GardenHttpError('unavailable','cancelled',true);
    const key = this.dependencies.requestKey();
    const cancel = () => { void this.dependencies.bridge.cancel(key).catch(() => undefined); };
    signal?.addEventListener('abort',cancel,{ once:true });
    let reply: Awaited<ReturnType<NativeGardenBridge['request']>>;
    try { reply = await this.dependencies.bridge.request(key,action,operationId,token,this.timeoutMs); }
    catch (error) { throw nativeFailure(error); }
    finally { signal?.removeEventListener('abort',cancel); }
    if (signal?.aborted) throw new GardenHttpError('unavailable','cancelled',true,true);
    if (this.dependencies.currentUser()?.uid !== user.uid) throw new GardenHttpError('unauthenticated','session_changed',false,true);
    if (!reply || !Number.isInteger(reply.status) || reply.status < 200 || reply.status > 599
      || (reply.status >= 300 && reply.status <= 399) || typeof reply.body !== 'string' || reply.body.length > 16384) {
      throw new GardenHttpError('unavailable','invalid_response',true,true);
    }
    let parsed: unknown;
    try { parsed = JSON.parse(reply.body); } catch { throw new GardenHttpError('unavailable','invalid_response',true,true); }
    if (!object(parsed) || typeof parsed.ok !== 'boolean') throw new GardenHttpError('unavailable','invalid_response',true,true);
    if (reply.status < 300 && parsed.ok === true && Object.hasOwn(parsed,'data')) return parsed.data;
    const error = object(parsed.error) ? parsed.error : {};
    const code = typeof error.code === 'string' && codes.has(error.code) ? error.code : 'unavailable';
    const reason = typeof error.reason === 'string' && /^[a-z_]{1,64}$/.test(error.reason) ? error.reason : 'backend_unavailable';
    const retryable = error.retryable === true || (!Object.hasOwn(error,'retryable') && reply.status >= 500);
    if (field === 'attemptId' && !retryable && [400,404,409].includes(reply.status)) await this.dependencies.terminals.write(user.uid,operationId);
    const retry = Number.isInteger(reply.retryAfterSeconds) && reply.retryAfterSeconds >= 0 && reply.retryAfterSeconds <= 3600 ? reply.retryAfterSeconds : 0;
    throw new GardenHttpError(code,reason,retryable,reply.status >= 500,reply.status,retry);
  }
}
