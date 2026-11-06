import type { createNotificationBackend } from '../../services/student-support/notification-runtime';
type Runtime = ReturnType<typeof createNotificationBackend>;
type Row = Record<string, unknown>;
export type CanonicalChange = { id: string; occurredAt: number; collection: 'messages' | 'appointments' | 'assessments' | 'announcements'; documentId: string; before: Row | null; after: Row | null };
/** Server-only callbacks: deliberately not an HTTP/webhook handler or deployed trigger.
 * The host must attest change authenticity using its trusted change-stream context.
 * Never point this at the client-writable notifications inbox or trust request JSON. */
export function createAutomaticNotificationEvents(ports: {
  runtime: Runtime;
  verifyChange(change: CanonicalChange): Promise<boolean>;
  now?(): number;
  // Bounded authoritative audience pages, independently reauthorized by the core.
  audience(collection: 'assessments' | 'announcements', documentId: string, cursor?: string): Promise<{ uids: string[]; next: string | null }>;
}) {
  const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  return {
    async changed(change: CanonicalChange, cursor?: string) {
      if (!ports.runtime.enabled) return { status: 'disabled' as const, next: null };
      const now = (ports.now ?? Date.now)();
      if (!change || !id(change.documentId) || typeof change.id !== 'string' || !change.id || change.id.length > 512
        || !Number.isSafeInteger(now) || !Number.isSafeInteger(change.occurredAt) || change.occurredAt < 0
        || change.occurredAt > now + 60000 || now - change.occurredAt > 3600000
        || !['messages', 'appointments', 'assessments', 'announcements'].includes(change.collection)
        || (cursor !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(cursor)) || !await ports.verifyChange(change)) throw Error('Untrusted notification event');
      if (!change.after) return { status: 'ignored' as const, next: null };
      const dispatch = async (eventId: string | null) => { if (eventId) await ports.runtime.deliver(eventId); };
      if (change.collection === 'messages') {
        if (!change.before) for (const eventId of await ports.runtime.messageCreated(change.documentId)) await dispatch(eventId);
      } else if (change.collection === 'appointments') {
        await dispatch(await ports.runtime.appointmentChanged(change.documentId, change.before, change.after, change.id));
      } else {
        const published = change.collection === 'assessments' ? 'isPublished' : 'isActive';
        if ((change.before && change.before[published] !== false) || change.after[published] !== true) return { status: 'ignored' as const, next: null };
        const page = await ports.audience(change.collection, change.documentId, cursor);
        if (!Array.isArray(page.uids) || page.uids.length > 100 || page.uids.some(uid => !id(uid)) || (page.next !== null && (!id(page.next) || page.next === cursor))) throw Error('Invalid trusted audience');
        for (const uid of new Set(page.uids)) {
          await dispatch(change.collection === 'assessments'
            ? await ports.runtime.assessmentPublished(change.documentId, change.before, change.after, uid, change.id)
            : await ports.runtime.announcementPublished(change.documentId, change.before, change.after, uid));
        }
        // The host must durably retain and resume this cursor, never discard it.
        return { status: 'processed' as const, next: page.next };
      }
      return { status: 'processed' as const, next: null };
    },
    async reminder(appointmentId: string) {
      if (!ports.runtime.enabled) return 'disabled' as const;
      if (!id(appointmentId)) throw Error('Invalid appointment');
      const eventId = await ports.runtime.appointmentReminder(appointmentId); if (eventId) await ports.runtime.deliver(eventId);
      return eventId ? 'processed' as const : 'ignored' as const;
    },
  };
}
