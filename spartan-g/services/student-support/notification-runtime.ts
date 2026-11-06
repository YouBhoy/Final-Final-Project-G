/** LOCAL PREPARATION ONLY. No entry point, SDK initialization, trigger or scheduler is installed. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createPushDelivery, canonicalPushAuthorized, type PushEvent, type PushBinding, type SupportProject } from './support-runtime';
import { opaqueId, validPhonePreferences, categoryEnabled, type PhonePreferences, type PushEnvelope, type PushKind } from '../../packages/shared-services/src/notifications/push-contract';
export const PROPOSED_PUSH_COLLECTIONS = ['notification_devices', 'notification_token_owners', 'notification_challenges', 'notification_events', 'notification_deliveries', 'notification_rate_limits'] as const;
type Row = Record<string, any>;
export interface PushTransaction { get(path: string): Promise<Row | null>; set(path: string, data: Row): void }
export interface PushStore {
  get(path: string): Promise<Row | null>;
  transaction<T>(fn: (tx: PushTransaction) => Promise<T>): Promise<T>;
  bindings(uid: string): Promise<Row[]>;
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const equal = (a: string, b: string) => /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const token = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_:\-]{32,4096}$/.test(value) && !/^(Expo|Exponent)PushToken/.test(value);
const keys = (r: Row, names: string[]) => Object.keys(r).sort().join(',') === names.sort().join(',');
const secret = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(v);
const millis = (v: unknown): number => v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis(): number }).toMillis() : typeof v === 'number' ? v : NaN;
export type StoredEvent = PushEvent & { revision: string; kind: PushKind };
// Only authorization/event fields; read receipts, notes and other clinical edits
// must not fabricate a new push or invalidate an otherwise current notification.
export function sourceRevision(r: Row) { return hash(JSON.stringify([r.studentId ?? null, r.facilitatorId ?? null, r.senderId ?? null, r.conversationId ?? null, r.status ?? null, millis(r.scheduledAt) || null, r.notifyBeforeMinutes ?? null, r.isPublished ?? null, r.authorId ?? null, r.targetRoles ?? null, r.isActive ?? null, millis(r.acceptedAt) || null, millis(r.rescheduleRequestedAt) || null])); }
export function createNotificationBackend(ports: {
  enabled: boolean; project: SupportProject; database: '(default)'; store: PushStore; now(): number;
  verifyStudent(token: string): Promise<{ uid: string; role: 'student' }>;
  accountActive?(uid: string): Promise<boolean>;
  consume(uid: string): Promise<boolean>;
  // Host policy: synthetic recipient allowlist and independent transactional send budget.
  permitSend?(uid: string, kind: 'proof' | 'visible'): Promise<boolean>;
  allowSend?(uid: string): Promise<boolean>;
  // Data-only proof is sent to the native token, NEVER returned in the HTTP response.
  challenge(token: string, data: { challengeId: string; proof: string }, authorize: () => Promise<boolean>, uid: string): Promise<void>;
  send(message: Parameters<Parameters<typeof createPushDelivery>[0]['send']>[0], authorize: () => Promise<boolean>, uid: string): Promise<void>;
  random?(): string;
}) {
  if (!['spartan-g-a2d80', 'spartan-g-assessment-staging'].includes(ports.project) || ports.database !== '(default)') throw Error('Notification project mismatch');
  const store = ports.store, now = ports.now, nonce = ports.random ?? (() => randomBytes(32).toString('hex'));
  const device = (v: string) => `notification_devices/${v}`, ownerPath = (t: string) => `notification_token_owners/${hash(ports.project + ':' + t)}`;
  // Keep lifecycle/cancellation metadata in the existing server-only challenge collection.
  const registration = (bindingId: string) => `notification_challenges/binding_${bindingId}`;
  const cancellation = (bindingId: string, capability: string) => `notification_challenges/revoked_${hash(bindingId + ':' + capability)}`;
  async function revoke(bindingId: string, capability: string) {
    await store.transaction(async tx => {
      const statePath = registration(bindingId), cancelledPath = cancellation(bindingId, capability);
      const [b, state, cancelled] = await Promise.all([tx.get(device(bindingId)), tx.get(statePath), tx.get(cancelledPath)]);
      // A repeated old cleanup must not revoke a replacement generation.
      if (cancelled?.bindingId === bindingId && cancelled.expiresAt > now() && equal(cancelled.revocationHash, hash(capability))) return;
      const ownsBinding = !!b && equal(b.revocationHash, hash(capability));
      const ownsPending = !!state && equal(state.revocationHash, hash(capability));
      if (!ownsBinding && !ownsPending) { if (!b && !state) return; throw Error('Unauthorized revocation'); }
      const indexPath = ownsBinding ? ownerPath(b!.token) : null, index = indexPath ? await tx.get(indexPath) : null;
      if (ownsBinding) tx.set(device(bindingId), { ...b, active: false, revokedAt: now() });
      if (ownsPending) tx.set(statePath, { ...state, cancelled: true });
      tx.set(cancelledPath, { bindingId, revocationHash: hash(capability), expiresAt: now() + 86400000 });
      if (indexPath && index?.bindingId === bindingId) tx.set(indexPath, { ...index, active: false });
    });
  }
  async function authorized(event: StoredEvent): Promise<boolean> {
    const collection = event.category === 'message' ? 'messages' : event.category === 'appointment' ? 'appointments' : event.category === 'assessment' ? 'assessments' : event.category === 'system' ? 'announcements' : null;
    if (!collection || !id(event.recipientUid) || !new RegExp(`^${collection}/[A-Za-z0-9_-]{1,128}$`).test(event.sourcePath) || !/^[a-f0-9]{64}$/.test(event.revision)) return false;
    const source = await store.get(event.sourcePath), recipient = await store.get(`users/${event.recipientUid}`);
    if (!source || sourceRevision(source) !== event.revision || !recipient || (ports.accountActive && !await ports.accountActive(event.recipientUid))) return false;
    const r: Row = { ...source, id: event.sourcePath.split('/')[1] };
    if (event.kind === 'appointment-reminder') {
      const scheduled = millis(r.scheduledAt), minutes = r.notifyBeforeMinutes;
      if (r.status !== 'accepted' || !Number.isSafeInteger(scheduled) || !Number.isSafeInteger(minutes) || minutes <= 0 || minutes > 1440 || now() < scheduled - minutes * 60000 || now() >= scheduled) return false;
    }
    const c = event.category === 'message' && id(r.conversationId) ? await store.get(`conversations/${r.conversationId}`) : undefined;
    const author = event.category === 'system' ? r.authorId : r.senderId;
    const sender = ['message', 'system'].includes(event.category) && id(author) ? await store.get(`users/${author}`) : undefined;
    if (sender && ports.accountActive && !await ports.accountActive(author)) return false;
    if (event.category === 'appointment') {
      const facilitator = id(r.facilitatorId) && await store.get(`users/${r.facilitatorId}`);
      if (!facilitator || facilitator.role !== 'facilitator' || facilitator.isActive !== true || (ports.accountActive && !await ports.accountActive(r.facilitatorId))) return false;
    }
    return canonicalPushAuthorized(event, r, { ...recipient, uid: event.recipientUid } as any,
      c ? { id: r.conversationId, participantIds: c.participantIds } : undefined,
      sender ? { ...sender, uid: author } as any : undefined);
  }
  const delivery = createPushDelivery({ enabled: ports.enabled, now, loadEvent: async eventId => await store.get(`notification_events/${eventId}`) as StoredEvent | null,
    authorize: e => authorized(e as StoredEvent),
    binding: async bindingId => { const b = await store.get(device(bindingId)); return b && b.expiresAt > now() ? b as PushBinding : null; },
    claim: (eventId, bindingId) => store.transaction(async tx => {
      const path = `notification_deliveries/${hash(eventId + ':' + bindingId)}`;
      if (await tx.get(path)) return false;
      tx.set(path, { eventId, bindingId, status: 'sending', createdAt: now(), expiresAt: now() + 30 * 86400000 }); return true;
    }),
    finish: async (eventId, bindingId, status) => { await store.transaction(async tx => {
      const path = `notification_deliveries/${hash(eventId + ':' + bindingId)}`, row = await tx.get(path);
      if (row) tx.set(path, { ...row, status, finishedAt: now() });
    }); },
    send: async message => { try {
      const binding = await store.get(device(message.data.bindingId));
      if (!binding?.active || binding.token !== message.token || (ports.permitSend && !await ports.permitSend(binding.uid, 'visible'))) throw Error('Delivery stopped');
      const current = await store.get(device(message.data.bindingId));
      if (!current?.active || current.uid !== binding.uid || current.token !== message.token || current.expiresAt <= now() || !categoryEnabled(current.preferences, message.data.category)) throw Error('Binding changed before send');
      await ports.send(message, async () => {
        const b = await store.get(device(message.data.bindingId)), event = await store.get(`notification_events/${message.data.eventId}`) as StoredEvent | null;
        return !!b?.active && b.uid === binding.uid && b.token === message.token && b.generation === current.generation
          && b.expiresAt > now() && categoryEnabled(b.preferences, message.data.category) && !!event && event.recipientUid === b.uid
          && event.expiresAt > now() && await authorized(event) && (!ports.allowSend || await ports.allowSend(b.uid));
      }, binding.uid); } catch (error) {
      const code = (error as { code?: string })?.code;
      if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code ?? '')) {
        // Only revoke this exact token/version; never invalidate a concurrent refresh.
        await store.transaction(async tx => { const b = await tx.get(device(message.data.bindingId));
          if (b?.token === message.token) { const path = ownerPath(message.token), index = await tx.get(path);
            tx.set(device(b.id), { ...b, active: false, invalidAt: now() });
            if (index?.bindingId === b.id) tx.set(path, { ...index, active: false });
          }
        });
      }
      throw Error('Delivery unavailable'); // No token, provider message or private content in logs.
    } },
  });
  async function enqueue(sourcePath: string, recipientUid: string, kind: StoredEvent['kind'], source: Row, revisionKey: string) {
    const eventId = hash([ports.project, sourcePath, recipientUid, kind, revisionKey].join(':'));
    const category = kind === 'message' ? 'message' : kind === 'assessment-published' ? 'assessment' : kind === 'announcement' ? 'system' : 'appointment';
    const event: StoredEvent = { id: eventId, category, kind, recipientUid, sourcePath, revision: sourceRevision(source), expiresAt: Math.min(now() + 3600000, kind === 'appointment-reminder' ? millis(source.scheduledAt) : Infinity) };
    if (!await authorized(event)) return null;
    await store.transaction(async tx => { const path = `notification_events/${eventId}`; if (!await tx.get(path)) tx.set(path, event); });
    return eventId;
  }
  return {
    enabled: ports.enabled,
    async handle(request: { method: string; path: string; authorization?: string; body: unknown }) {
      const reply = (status: number, body: Row = {}) => ({ status, body, headers: { 'Cache-Control': 'no-store' } });
      if (request.method !== 'POST') return reply(405);
      if (!ports.enabled) return reply(503, { error: 'notification-backend-disabled' });
      const b = request.body as Row;
      if (!b || typeof b !== 'object' || Array.isArray(b) || Buffer.byteLength(JSON.stringify(b)) > 8192) return reply(400);
      try {
        if (request.path === 'revoke') { if (!keys(b, ['bindingId', 'revocationKey']) || !opaqueId(b.bindingId) || !secret(b.revocationKey)) return reply(400); await revoke(b.bindingId, b.revocationKey); return reply(200); }
        const bearer = request.authorization?.match(/^Bearer ([A-Za-z0-9._-]{20,8192})$/); if (!bearer) return reply(401);
        const actor = await ports.verifyStudent(bearer[1]); if (!id(actor.uid) || actor.role !== 'student') return reply(403);
        if (!await ports.consume(actor.uid)) return reply(429);
        if (request.path === 'begin') {
          if (!keys(b, ['token', 'installationId', 'preferences', 'revocationKey']) || !token(b.token) || !opaqueId(b.installationId) || !secret(b.revocationKey) || !validPhonePreferences(b.preferences) || !b.preferences.phoneEnabled) return reply(400);
          const challengeId = nonce(), proof = nonce(), bindingId = hash(`${ports.project}:${actor.uid}:${b.installationId}`);
          if (!opaqueId(challengeId) || !secret(proof) || /^(binding_|revoked_)/.test(challengeId)) throw Error('Invalid randomness');
          await store.transaction(async tx => {
            const path = `notification_challenges/${challengeId}`, statePath = registration(bindingId);
            const [collision, state, current, cancelled] = await Promise.all([tx.get(path), tx.get(statePath), tx.get(device(bindingId)), tx.get(cancellation(bindingId, b.revocationKey))]);
            if (collision || (cancelled && cancelled.expiresAt > now())) throw Error('Registration replay');
            if ((state && (state.uid !== actor.uid || state.installationId !== b.installationId)) || (current && (current.uid !== actor.uid || current.installationId !== b.installationId))) throw Error('Binding collision');
            if ((state && (!Number.isSafeInteger(state.generation) || state.generation <= 0)) || (current?.generation !== undefined && !Number.isSafeInteger(current.generation))) throw Error('Invalid generation');
            const previous = Math.max(state?.generation ?? 0, current?.generation ?? 0), generation = previous + 1;
            if (!Number.isSafeInteger(previous) || previous < 0 || !Number.isSafeInteger(generation)) throw Error('Invalid generation');
            tx.set(statePath, { uid: actor.uid, bindingId, installationId: b.installationId, generation, challengeId, revocationHash: hash(b.revocationKey), cancelled: false, expiresAt: now() + 86400000 });
            tx.set(path, { uid: actor.uid, bindingId, generation, token: b.token, installationId: b.installationId, preferences: b.preferences, revocationHash: hash(b.revocationKey), proofHash: hash(proof), expiresAt: now() + 300000, consumed: false });
          });
          if (ports.permitSend && !await ports.permitSend(actor.uid, 'proof')) throw Error('Registration stopped');
          await ports.challenge(b.token, { challengeId, proof }, async () => {
            const c = await store.get(`notification_challenges/${challengeId}`), state = await store.get(registration(bindingId));
            const account = await store.get(`users/${actor.uid}`);
            return !!c && c.uid === actor.uid && c.token === b.token && c.consumed === false && c.expiresAt > now()
              && !!state && state.challengeId === challengeId && state.generation === c.generation && state.cancelled === false
              && state.expiresAt > now() && account?.role === 'student' && account.isActive === true
              && (!ports.accountActive || await ports.accountActive(actor.uid))
              && (!ports.allowSend || await ports.allowSend(actor.uid));
          }, actor.uid);
          return reply(200, { challengeId, bindingId });
        }
        if (request.path === 'complete') {
          if (!keys(b, ['challengeId', 'proof']) || !opaqueId(b.challengeId) || !secret(b.proof)) return reply(400);
          const bindingId = await store.transaction(async tx => {
            const challengePath = `notification_challenges/${b.challengeId}`, c = await tx.get(challengePath);
            if (!c || c.uid !== actor.uid || c.expiresAt <= now() || !equal(c.proofHash, hash(b.proof))) throw Error('Proof rejected');
            const state = await tx.get(registration(c.bindingId));
            if (!state || state.bindingId !== c.bindingId || state.uid !== actor.uid || state.installationId !== c.installationId || state.challengeId !== b.challengeId || state.cancelled !== false || state.expiresAt <= now()
              || !Number.isSafeInteger(c.generation) || c.generation <= 0 || state.generation !== c.generation || !equal(state.revocationHash, c.revocationHash)) throw Error('Superseded registration');
            const current = await tx.get(device(c.bindingId)), indexPath = ownerPath(c.token), index = await tx.get(indexPath);
            if (index?.active && index.bindingId !== c.bindingId) {
              const previous = await tx.get(device(index.bindingId));
              if (previous?.active && previous.expiresAt > now()) throw Error('Token already bound');
            }
            if (current && (current.uid !== actor.uid || current.installationId !== c.installationId)) throw Error('Binding collision');
            if (c.consumed) { if (!current?.active || current.token !== c.token || current.generation !== c.generation || !equal(current.revocationHash, c.revocationHash)) throw Error('Consumed proof'); return c.bindingId as string; }
            const oldPath = current && current.token !== c.token ? ownerPath(current.token) : null, old = oldPath ? await tx.get(oldPath) : null;
            if (oldPath && old?.bindingId === c.bindingId) tx.set(oldPath, { ...old, active: false });
            tx.set(device(c.bindingId), { id: c.bindingId, uid: actor.uid, installationId: c.installationId, generation: c.generation, token: c.token, active: true, preferences: c.preferences, revocationHash: c.revocationHash, updatedAt: now(), expiresAt: now() + 86400000 });
            tx.set(indexPath, { bindingId: c.bindingId, uid: actor.uid, active: true, expiresAt: now() + 30 * 86400000 }); tx.set(challengePath, { ...c, consumed: true }); return c.bindingId as string;
          });
          return reply(200, { id: bindingId });
        }
        if (request.path === 'preferences') {
          if (!keys(b, ['bindingId', 'preferences']) || !opaqueId(b.bindingId) || !validPhonePreferences(b.preferences)) return reply(400);
          await store.transaction(async tx => { const current = await tx.get(device(b.bindingId)); if (!current || current.uid !== actor.uid || !current.active) throw Error('Binding unavailable');
            tx.set(device(b.bindingId), { ...current, preferences: b.preferences, updatedAt: now() }); }); return reply(200);
        }
        if (request.path === 'resolve') {
          if (!keys(b, ['envelope'])) return reply(400);
          const { parsePushEnvelope } = await import('../../packages/shared-services/src/notifications/push-contract');
          const e = parsePushEnvelope(b.envelope, now()); if (!e) return reply(400);
          const binding = await store.get(device(e.bindingId)), event = await store.get(`notification_events/${e.eventId}`) as StoredEvent | null;
          if (!binding?.active || binding.uid !== actor.uid || binding.expiresAt <= now() || !event || event.recipientUid !== actor.uid || event.category !== e.category || event.expiresAt <= now() || !await authorized(event)) return reply(403);
          const source = await store.get(event.sourcePath);
          return reply(200, { eventId: e.eventId, bindingId: e.bindingId, category: e.category, route: e.category === 'message' ? { name: 'conversation', conversationId: source!.conversationId } : { name: e.category === 'appointment' ? 'appointments' : e.category === 'system' ? 'home' : 'assessments' } });
        }
        return reply(404);
      } catch { return reply(403, { error: 'notification-operation-unavailable' }); }
    },
    async messageCreated(messageId: string) {
      if (!ports.enabled || !id(messageId)) return [];
      const r = await store.get(`messages/${messageId}`); if (!r || !id(r.conversationId)) return [];
      const c = await store.get(`conversations/${r.conversationId}`); if (!Array.isArray(c?.participantIds) || c.participantIds.length > 10) return [];
      const result: string[] = []; for (const uid of c.participantIds) { if (!id(uid)) continue; const event = await enqueue(`messages/${messageId}`, uid, 'message', r, messageId); if (event) result.push(event); } return result;
    },
    async appointmentChanged(appointmentId: string, before: Row | null, after: Row, trustedChangeId?: string) {
      if (!ports.enabled || !id(appointmentId) || !id(after.studentId) || !['accepted', 'reschedule_requested', 'cancelled', 'requested'].includes(after.status)
        || (before && before.status === after.status && (millis(before.scheduledAt) || null) === (millis(after.scheduledAt) || null))) return null;
      // A new booking is a generic student receipt, never a fabricated confirmation
      // or facilitator alert. Existing canonical ownership/Auth checks still apply.
      if (!before && !['requested', 'accepted'].includes(after.status)) return null;
      if (before && after.status === 'requested' && !(before.status === 'reschedule_requested' && millis(before.scheduledAt) !== millis(after.scheduledAt))) return null;
      const kind = after.status === 'accepted' && before?.status !== 'accepted' ? 'appointment-confirmed'
        : before && (after.status === 'reschedule_requested' || millis(before.scheduledAt) !== millis(after.scheduledAt)) ? 'appointment-rescheduled' : 'appointment-update';
      // Equivalent transitions deduplicate even if a host assigns a fresh retry ID.
      return enqueue(`appointments/${appointmentId}`, after.studentId, kind, after, hash(sourceRevision(before ?? {}) + ':' + sourceRevision(after)));
    },
    async appointmentReminder(appointmentId: string) {
      if (!ports.enabled || !id(appointmentId)) return null;
      const r = await store.get(`appointments/${appointmentId}`); if (!r || !id(r.studentId)) return null;
      return enqueue(`appointments/${appointmentId}`, r.studentId, 'appointment-reminder', r, sourceRevision(r));
    },
    // Audience must be derived by the trusted event host, never accepted from an HTTP caller.
    async assessmentPublished(assessmentId: string, before: Row | null, after: Row, authorizedStudentUid: string, trustedChangeId?: string) {
      if (!ports.enabled || !id(assessmentId) || !id(authorizedStudentUid) || (before && before.isPublished !== false) || after.isPublished !== true) return null;
      const publication = hash(sourceRevision(before ?? {}) + ':' + sourceRevision(after) + ':' + (millis(after.updatedAt) || 'legacy'));
      return enqueue(`assessments/${assessmentId}`, authorizedStudentUid, 'assessment-published', after, publication);
    },
    async announcementPublished(announcementId: string, before: Row | null, after: Row, authorizedStudentUid: string) {
      if (!ports.enabled || !id(announcementId) || !id(authorizedStudentUid) || (before && before.isActive !== false) || after.isActive !== true) return null;
      const publication = hash(sourceRevision(before ?? {}) + ':' + sourceRevision(after) + ':' + (millis(after.updatedAt) || 'legacy'));
      return enqueue(`announcements/${announcementId}`, authorizedStudentUid, 'announcement', after, publication);
    },
    async deliver(eventId: string) {
      if (!ports.enabled) return [];
      const event = await store.get(`notification_events/${eventId}`); if (!event || !id(event.recipientUid)) return [];
      const bindings = await store.bindings(event.recipientUid);
      if (bindings.length > 100) throw Error('Binding fanout limit');
      const results: string[] = []; for (const b of bindings) results.push(await delivery(eventId, b.id)); return results;
    },
  };
}
