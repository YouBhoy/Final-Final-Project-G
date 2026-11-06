/** Server-only preparation. No deployed endpoint, trigger, credentials, provider or database client is installed. */
import { pushText, PUSH_CHANNELS, PUSH_CATEGORIES, categoryEnabled, opaqueId, type PhonePreferences, type PushCategory, type PushEnvelope, type PushKind } from '../../packages/shared-services/src/notifications/push-contract';
export type SupportProject = 'spartan-g-a2d80' | 'spartan-g-assessment-staging';
export interface VerifiedStudent { uid: string; role: 'student' }
export const PUBLIC_GUIDANCE = {
  navigation: 'Spartan-G provides Assessments, Facilitators, My Appts, Messages, Garden, My Forest, Profile and Resources. Personal record questions use authorized app services, never a model.',
  garden: 'Garden displays saved progression. My Forest displays submitted check-in history and owner reflection notes. Do not promise rewards, invent balances or interpret screening results.',
  resources: 'Resources contains educational wellbeing information. Refer students to authorized institutional guidance staff for personal concerns. Do not diagnose or invent contact details, crisis numbers, medical advice or privacy promises.',
} as const;
type GuidanceTopic = keyof typeof PUBLIC_GUIDANCE;
const FALLBACK = 'General AI guidance is unavailable. Use Sparty system help, Resources or Facilitators. Personal records are never sent to this service.';
async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Server operation timed out')), ms); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
export function createGuidanceHandler(ports: {
  enabled: boolean; verifyStudent(token: string): Promise<VerifiedStudent>;
  // Must be an atomic, distributed server limiter; no permissive default or process-local quota.
  consume(uid: string, operation: 'guidance'): Promise<boolean>;
  generate?: (approvedPublicInstruction: string, signal: AbortSignal) => Promise<unknown>;
  timeoutMs?: number;
}) {
  return async (request: { method: string; authorization?: string; body: unknown }) => {
    const reply = (status: number, text = FALLBACK) => ({ status, body: { text }, headers: { 'Cache-Control': 'no-store' } });
    if (request.method !== 'POST') return reply(405);
    if (!ports.enabled || !ports.generate) return reply(503);
    const match = request.authorization?.match(/^Bearer ([A-Za-z0-9._-]{20,8192})$/); if (!match) return reply(401);
    const body = request.body as { questionId?: unknown } | null;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== 'questionId' || typeof body.questionId !== 'string' || !Object.prototype.hasOwnProperty.call(PUBLIC_GUIDANCE, body.questionId)) return reply(400);
    let student: VerifiedStudent;
    try { student = await bounded(ports.verifyStudent(match[1]), ports.timeoutMs ?? 8000); if (!student.uid || student.role !== 'student') return reply(403); }
    catch { return reply(401); }
    try {
      if (!await bounded(ports.consume(student.uid, 'guidance'), ports.timeoutMs ?? 8000)) return reply(429);
      const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Provider receives a fixed public instruction only: no UID, input text, chat, records or token.
        const value = await Promise.race([ports.generate(PUBLIC_GUIDANCE[body.questionId as GuidanceTopic], controller.signal), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Provider timeout')); }, ports.timeoutMs ?? 8000); })]);
        if (typeof value !== 'string' || !value.trim() || value.length > 1200 || /<[^>]+>|https?:\/\/|\b[\w.+-]+@[\w.-]+\.[a-z]+\b|\+?\d[\d ()-]{7,}\d|\b(diagnos\w*|suicid\w*|risk score|risk level|medication|absolutely confidential)\b/i.test(value)) return reply(503);
        return reply(200, value.trim());
      } finally { if (timer !== undefined) clearTimeout(timer); controller.abort(); }
    } catch { return reply(503); }
  };
}

/** Firebase Admin adapter: SDK verification checks issuer/audience/signature/expiry/revocation.
 * Clients cannot supply role/UID. Both clients remain on the canonical users/{uid} contract. */
export function createStudentVerifier(project: SupportProject, admin: {
  authProject: string; firestoreProject: string;
  verifyIdToken(token: string, checkRevoked: true): Promise<{ uid: string; aud: string; iss: string; firebase?: { sign_in_provider?: string } }>;
  getUser(uid: string): Promise<{ disabled: boolean }>;
  getUserDocument(uid: string): Promise<{ role?: unknown; isActive?: unknown } | null>;
}) {
  if (!['spartan-g-a2d80', 'spartan-g-assessment-staging'].includes(project) || admin.authProject !== project || admin.firestoreProject !== project) throw new Error('Runtime project mismatch');
  return async (token: string): Promise<VerifiedStudent> => {
    const verified = await admin.verifyIdToken(token, true);
    if (!verified.uid || verified.aud !== project || verified.iss !== `https://securetoken.google.com/${project}` || verified.firebase?.sign_in_provider === 'anonymous') throw new Error('Invalid identity');
    const user = await admin.getUser(verified.uid), account = await admin.getUserDocument(verified.uid);
    if (user.disabled || account?.role !== 'student' || account.isActive !== true) throw new Error('Unauthorized');
    return { uid: verified.uid, role: 'student' };
  };
}

export type PushEvent = { id: string; category: PushCategory; kind?: PushKind; recipientUid: string; sourcePath: string; expiresAt: number };
export type PushBinding = { id: string; uid: string; token: string; active: boolean; preferences: PhonePreferences };
/** Minimal projections from canonical server reads; never pass message bodies or screening fields. */
export function canonicalPushAuthorized(event: PushEvent, record: Record<string, unknown> | null, recipient: { uid: string; role: string; isActive: boolean } | null, conversation?: { id: string; participantIds: unknown }, sender?: { uid: string; role: string; isActive: boolean }): boolean {
  if (!record || !recipient || recipient.uid !== event.recipientUid || recipient.role !== 'student' || recipient.isActive !== true) return false;
  const collection = event.category === 'message' ? 'messages' : event.category === 'appointment' ? 'appointments' : event.category === 'system' ? 'announcements' : 'assessments';
  if (typeof record.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(record.id) || event.sourcePath !== `${collection}/${record.id}`) return false;
  if (event.category === 'message') return typeof record.conversationId === 'string' && conversation?.id === record.conversationId && !!sender && sender.uid === record.senderId && sender.uid !== recipient.uid && sender.role === 'facilitator' && sender.isActive === true && Array.isArray(conversation.participantIds) && conversation.participantIds.includes(recipient.uid) && conversation.participantIds.includes(sender.uid);
  if (event.category === 'appointment') return record.studentId === recipient.uid && typeof record.facilitatorId === 'string' && ['requested', 'accepted', 'reschedule_requested', 'completed', 'cancelled', 'rejected', 'no_show'].includes(String(record.status));
  if (event.category === 'system') return record.isActive === true && Array.isArray(record.targetRoles)
    && record.targetRoles.includes('student') && !!sender && sender.uid === record.authorId
    && ['facilitator', 'super_admin'].includes(sender.role) && sender.isActive === true;
  // A published catalog template is distinct from legacy student/clinical records.
  return event.category === 'assessment' && record.isPublished === true && !Object.prototype.hasOwnProperty.call(record, 'studentId');
}
export function createPushDelivery(ports: {
  enabled: boolean; now(): number; loadEvent(id: string): Promise<PushEvent | null>;
  // Re-read canonical record/participants/assignment/status, not client-provided recipient lists.
  authorize(event: PushEvent): Promise<boolean>; binding(id: string): Promise<PushBinding | null>;
  claim(eventId: string, bindingId: string): Promise<boolean>;
  finish(eventId: string, bindingId: string, result: 'sent' | 'ambiguous' | 'suppressed'): Promise<void>;
  send(message: { token: string; notification: { title: string; body: string }; data: PushEnvelope; android: { notification: { channelId: string; visibility: 'private' }; ttl: number } }): Promise<void>;
}) {
  return async (eventId: string, bindingId: string) => {
    if (!ports.enabled) return 'disabled' as const;
    if (!opaqueId(eventId) || !opaqueId(bindingId)) return 'rejected' as const;
    let claimed = false;
    try {
      const event = await ports.loadEvent(eventId), binding = await ports.binding(bindingId), now = ports.now();
      const source = event?.category === 'message' ? /^messages\/[A-Za-z0-9_-]{1,128}$/ : event?.category === 'appointment' ? /^appointments\/[A-Za-z0-9_-]{1,128}$/ : event?.category === 'system' ? /^announcements\/[A-Za-z0-9_-]{1,128}$/ : /^assessments\/[A-Za-z0-9_-]{1,128}$/;
      if (!Number.isSafeInteger(now) || now < 0 || !event || event.id !== eventId || !PUSH_CATEGORIES.includes(event.category) || !pushText(event.category, event.kind) || !source.test(event.sourcePath) || !binding || binding.id !== bindingId || binding.uid !== event.recipientUid || !binding.active || !categoryEnabled(binding.preferences, event.category) || !Number.isSafeInteger(event.expiresAt) || event.expiresAt <= now || !await ports.authorize(event)) return 'suppressed' as const;
      if (!await ports.claim(eventId, bindingId)) return 'duplicate' as const;
      claimed = true;
      // Recheck revocation, preferences and source authorization immediately before send.
      const current = await ports.binding(bindingId);
      if (!current || !current.active || current.uid !== binding.uid || current.token !== binding.token || !categoryEnabled(current.preferences, event.category) || !await ports.authorize(event)) { await ports.finish(eventId, bindingId, 'suppressed'); return 'suppressed' as const; }
      const issuedAt = ports.now(), expiresAt = Math.min(event.expiresAt, issuedAt + 3600000);
      if (!Number.isSafeInteger(issuedAt) || expiresAt <= issuedAt || typeof current.token !== 'string' || !/^[A-Za-z0-9_:\-]{20,4096}$/.test(current.token)) { await ports.finish(eventId, bindingId, 'suppressed'); return 'suppressed' as const; }
      await ports.send({ token: current.token, notification: { title: 'Spartan-G', body: pushText(event.category, event.kind)! }, data: { version: 1, category: event.category, eventId, bindingId, issuedAt, expiresAt }, android: { notification: { channelId: PUSH_CHANNELS[event.category], visibility: 'private' }, ttl: expiresAt - issuedAt } });
      await ports.finish(eventId, bindingId, 'sent'); return 'sent' as const;
    } catch {
      // Provider timeout can mean already delivered. Do not auto-retry or release the dedup claim.
      if (claimed) { try { await ports.finish(eventId, bindingId, 'ambiguous'); } catch { /* Operator review required; never resend automatically. */ } }
      return 'unavailable' as const;
    }
  };
}

/** Inject Firebase Admin messaging.send on a trusted server only, never an APK provider key. */
export function firebaseMessage(message: Parameters<Parameters<typeof createPushDelivery>[0]['send']>[0]) {
  const { data, ...rest } = message;
  return { ...rest, data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])) };
}
