import { createHash } from 'node:crypto';
import { logger } from 'firebase-functions';
export type GardenAuditEvent = 'authorization_denied' | 'rate_limited' | 'unauthenticated'
  | 'assessment_completed' | 'watering_completed' | 'duplicate_detected' | 'processing_failed'
  | 'submission_captured' | 'operator_rollout' | 'operator_allowlist' | 'operator_switch';
export interface GardenAuditDetails {
  readonly studentId?: string;
  readonly operationId?: string;
  readonly operation?: string;
  readonly reason?: string;
  readonly revision?: number;
  readonly enabled?: boolean;
}
export type GardenAuditSink = (event: Readonly<Record<string, string | number | boolean>>) => void;
export const studentKey = (uid: string): string => createHash('sha256').update(JSON.stringify(['garden_student', uid])).digest('hex');
/** Per-instance log-volume guard only, never an authorization/rate-limit authority. */
export function boundedAuditSink(write: GardenAuditSink, clock: () => number = Date.now): GardenAuditSink {
  const sampled = new Set(['authorization_denied', 'rate_limited', 'unauthenticated', 'processing_failed']);
  const windows = new Map<string, {window:number; count:number; suppressed:number}>();
  return record => {
    const event = String(record.event);
    if (!sampled.has(event)) { write(record); return; } // Never sample administrative or committed outcome records.
    const window = Math.floor(clock() / 60000);
    const previous = windows.get(event);
    const bucket = previous?.window === window ? previous : {window, count:0, suppressed:0};
    windows.set(event, bucket);
    if (bucket.count >= 20) { bucket.suppressed++; return; }
    bucket.count++;
    write(previous && previous.window !== window && previous.suppressed
      ? {...record, previousWindowSuppressed:previous.suppressed} : record);
  };
}
const defaultSink = boundedAuditSink(value => logger.info('garden_audit', value));
/** Fixed event names and bounded fields only. Never serialize requests, errors, profiles or snapshots. */
export function gardenAudit(event: GardenAuditEvent, details: GardenAuditDetails = {}, sink: GardenAuditSink = defaultSink): void {
  const record: Record<string, string | number | boolean> = { schemaVersion: 1, event };
  if (details.studentId) record.studentKey = studentKey(details.studentId);
  if (details.operationId && /^[a-f0-9]{64}$/.test(details.operationId)) record.operationId = details.operationId;
  if (details.operation && ['capture', 'assessment', 'recovery', 'watering'].includes(details.operation)) record.operation = details.operation;
  if (details.reason && /^[a-z_]{1,64}$/.test(details.reason)) record.reason = details.reason;
  if (typeof details.revision === 'number' && Number.isSafeInteger(details.revision) && details.revision > 0) record.revision = details.revision;
  if (typeof details.enabled === 'boolean') record.enabled = details.enabled;
  try { sink(Object.freeze(record)); } catch { /* Logging failure must not change an already committed operation. */ }
}
