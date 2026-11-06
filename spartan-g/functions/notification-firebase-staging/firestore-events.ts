import type { FirestoreEvent, Change, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import type { CanonicalChange } from '../notification-preparation/automatic-events';
import { sourceRevision } from '../../services/student-support/notification-runtime';
import { PROJECT, DATABASE, stagingProject } from './policy';

export type SourceCollection = 'messages' | 'appointments' | 'assessments';
export type ProviderEvent = FirestoreEvent<QueryDocumentSnapshot | Change<DocumentSnapshot> | undefined>;
export class InvalidFirebaseSourceError extends Error {
  constructor() { super('Firebase notification source rejected'); }
}
type Row = Record<string, unknown>;
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const times = new Set(['scheduledAt', 'acceptedAt', 'rescheduleRequestedAt', 'updatedAt']);
const fields = ['senderId', 'conversationId', 'studentId', 'facilitatorId', 'status', 'scheduledAt', 'notifyBeforeMinutes', 'isPublished', 'acceptedAt', 'rescheduleRequestedAt', 'updatedAt'];

/** Only pass the SDK's trusted Firestore callback argument here, never HTTP JSON.
 * The source snapshot can contain private data in memory; only this projection persists. */
function projectSnapshot(snapshot: DocumentSnapshot, document: string): Row | null {
  if (!snapshot || snapshot.ref?.path !== document || typeof snapshot.exists !== 'boolean') throw Error('Invalid Firebase source snapshot');
  if (!snapshot.exists) return null;
  const data = snapshot.data(); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Invalid Firebase source data');
  const row: Row = {};
  for (const field of fields) if (Object.hasOwn(data, field) && data[field] !== undefined) {
    const original = data[field];
    if (times.has(field) && original !== null) {
      const value = typeof original?.toMillis === 'function' ? original.toMillis() : original;
      if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid Firebase source time');
      row[field] = value;
    } else {
      if (original !== null && !['string', 'number', 'boolean'].includes(typeof original)) throw Error('Invalid Firebase source field');
      if (typeof original === 'string' && original.length > 128) throw Error('Oversized Firebase source field');
      row[field] = original;
    }
  }
  return row;
}

export function normalizeFirestoreEvent(event: ProviderEvent, collection: SourceCollection, now = Date.now()): CanonicalChange | null {
  try { return normalizeTrustedEvent(event, collection, now); }
  catch { throw new InvalidFirebaseSourceError(); }
}

function normalizeTrustedEvent(event: ProviderEvent, collection: SourceCollection, now: number): CanonicalChange | null {
  if (!['messages', 'appointments', 'assessments'].includes(collection)) throw Error('Unexpected Firebase collection');
  stagingProject(event?.project, event?.database);
  const source = `//firestore.googleapis.com/projects/${PROJECT}/databases/${DATABASE}`;
  if (event.source !== source || !['', '(default)'].includes(event.namespace)
    || typeof event.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,256}$/.test(event.id)
    || typeof event.time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(event.time)) throw Error('Untrusted Firebase event context');
  const occurredAt = Date.parse(event.time), docId = event.document?.split('/')[1];
  if (!identifier(docId) || event.document !== `${collection}/${docId}` || event.subject !== 'documents/' + event.document
    || !Number.isSafeInteger(now) || !Number.isSafeInteger(occurredAt) || occurredAt > now + 60000 || now - occurredAt > 3600000) throw Error('Invalid Firebase event identity/time');
  const created = 'google.cloud.firestore.document.v1.created';
  if (!event.data || (collection === 'messages' ? event.type !== created
    : ![created, 'google.cloud.firestore.document.v1.updated', 'google.cloud.firestore.document.v1.written'].includes(event.type))) throw Error('Unexpected Firebase event type');
  const changed = 'before' in event.data && 'after' in event.data;
  if (event.type !== created && !changed) throw Error('Missing Firebase before/after data');
  const snapshots = changed ? event.data as Change<DocumentSnapshot> : null;
  const before = snapshots ? projectSnapshot(snapshots.before, event.document) : null;
  const after = projectSnapshot(snapshots ? snapshots.after : event.data as DocumentSnapshot, event.document);
  if (!after) return null; // Canonical deletion suppresses later sends; no deletion notification.
  if (collection === 'messages' && before) throw Error('Message update is not creation');
  if (before && sourceRevision(before) === sourceRevision(after)) return null; // Notes/read-receipt edits do not create work.
  return { id: event.id, occurredAt, collection, documentId: docId, before, after };
}

export function createFirestoreIntake(ports: { enabled: boolean; now(): number; enqueue(change: CanonicalChange): Promise<unknown> }) {
  return async (collection: SourceCollection, event: ProviderEvent) => {
    if (!ports.enabled) return 'disabled' as const;
    const change = normalizeFirestoreEvent(event, collection, ports.now());
    if (!change) return 'ignored' as const;
    await ports.enqueue(change); return 'recorded' as const;
  };
}
