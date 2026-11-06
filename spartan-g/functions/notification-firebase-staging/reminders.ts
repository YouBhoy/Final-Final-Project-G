import { createHash } from 'node:crypto';
import { sourceRevision, type PushStore } from '../../services/student-support/notification-runtime';
import type { Work } from './durable-work';
import { PROJECT } from './policy';

/** Called by trusted appointment ingestion, never by a mobile caller. Old revisions
 * need not be deleted: the worker must reauthorize and suppress stale jobs. */
export function createReminderPlanner(ports: {
  enabled: boolean; store: PushStore; now(): number;
  enqueue(key: string, work: Work, dueAt: number, expiresAt: number): Promise<unknown>;
}) {
  return async (appointmentId: string) => {
    if (!ports.enabled) return 'disabled' as const;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(appointmentId)) throw Error('Invalid reminder source');
    const row = await ports.store.get('appointments/' + appointmentId);
    const scheduledAt = typeof row?.scheduledAt?.toMillis === 'function' ? row.scheduledAt.toMillis() : row?.scheduledAt;
    if (!row || row.status !== 'accepted' || !Number.isSafeInteger(scheduledAt) || scheduledAt <= ports.now()
      || !Number.isSafeInteger(row.notifyBeforeMinutes) || row.notifyBeforeMinutes < 1 || row.notifyBeforeMinutes > 1440) return 'ignored' as const;
    const revision = sourceRevision(row), dueAt = Math.max(0, scheduledAt - row.notifyBeforeMinutes * 60000);
    const key = createHash('sha256').update(PROJECT + ':reminder:' + appointmentId + ':' + revision).digest('hex');
    await ports.enqueue(key, { kind: 'reminder', appointmentId, revision }, dueAt, scheduledAt);
    return 'planned' as const;
  };
}

export async function currentReminder(store: PushStore, work: Extract<Work, { kind: 'reminder' }>, now: number) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(work.appointmentId) || !/^[a-f0-9]{64}$/.test(work.revision)) return false;
  const row = await store.get('appointments/' + work.appointmentId);
  const scheduled = typeof row?.scheduledAt?.toMillis === 'function' ? row.scheduledAt.toMillis() : row?.scheduledAt;
  return !!row && row.status === 'accepted' && sourceRevision(row) === work.revision && Number.isSafeInteger(scheduled)
    && Number.isSafeInteger(row.notifyBeforeMinutes) && row.notifyBeforeMinutes > 0 && row.notifyBeforeMinutes <= 1440
    && now >= scheduled - row.notifyBeforeMinutes * 60000 && now < scheduled;
}
