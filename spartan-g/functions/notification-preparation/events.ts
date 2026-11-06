import type { createFirebaseNotificationRuntime } from './runtime';
type Runtime = ReturnType<typeof createFirebaseNotificationRuntime>;
type Snapshot = { exists: boolean; data(): Record<string, any> | undefined };
/** Plain callbacks only. Nothing calls onDocumentCreated/onDocumentUpdated/onSchedule.
 * Attach only after approval; do not attach to client-created `notifications` records. */
export function createPreparedNotificationEvents(runtime: Runtime, ports: {
  // Trusted, bounded, opt-in binding audience for the canonical published catalog.
  assessmentAudience(assessmentId: string, cursor?: string): Promise<{ uids: string[]; next: string | null }>;
}) {
  return {
    async messageCreated(event: { params: { messageId: string } }) {
      if (!runtime.enabled) return;
      const events = await runtime.messageCreated(event.params.messageId);
      for (const id of events) await runtime.deliver(id);
    },
    async appointmentUpdated(event: { id: string; params: { appointmentId: string }; data?: { before: Snapshot; after: Snapshot } }) {
      if (!runtime.enabled) return;
      if (!event.data?.before.exists || !event.data.after.exists) return;
      const before = event.data.before.data(), after = event.data.after.data(); if (!before || !after) return;
      if (!event.id || event.id.length > 512) throw Error('Trusted event ID required');
      const id = await runtime.appointmentChanged(event.params.appointmentId, before, after, event.id); if (id) await runtime.deliver(id);
    },
    async assessmentUpdated(event: { id: string; params: { assessmentId: string }; data?: { before: Snapshot; after: Snapshot } }, cursor?: string) {
      if (!runtime.enabled) return null;
      const before = event.data?.before.exists ? event.data.before.data() : null, after = event.data?.after.exists ? event.data.after.data() : null;
      if (!before || before.isPublished !== false || after?.isPublished !== true) return null;
      if (!event.id || event.id.length > 512) throw Error('Trusted event ID required');
      const audience = await ports.assessmentAudience(event.params.assessmentId, cursor);
      if (audience.uids.length > 100 || audience.uids.some(uid => !/^[A-Za-z0-9_-]{1,128}$/.test(uid))) throw Error('Invalid notification audience page');
      for (const uid of new Set(audience.uids)) { const id = await runtime.assessmentPublished(event.params.assessmentId, before, after, uid, event.id); if (id) await runtime.deliver(id); }
      // Host must persist/queue this continuation explicitly. No unbounded in-process scan.
      return audience.next;
    },
    async appointmentReminder(appointmentId: string) {
      if (!runtime.enabled) return;
      const id = await runtime.appointmentReminder(appointmentId); if (id) await runtime.deliver(id);
    },
  };
}
