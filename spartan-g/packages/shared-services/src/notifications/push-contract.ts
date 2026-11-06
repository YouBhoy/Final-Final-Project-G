/** Shared data contract only: no Firebase, native modules, credentials or network. */
export const PUSH_CATEGORIES = ['message', 'appointment', 'assessment', 'system'] as const;
export type PushCategory = typeof PUSH_CATEGORIES[number];
export const PUSH_CHANNELS: Record<PushCategory, string> = {
  message: 'spartan.messages.v1', appointment: 'spartan.appointments.v1', assessment: 'spartan.assessments.v1', system: 'spartan.general.v1',
};
export const PUSH_TEXT: Record<PushCategory, string> = {
  message: 'You have a new message.', appointment: 'You have an appointment update.', assessment: 'An assessment update is available.', system: 'You have a Spartan-G update.',
};
export const PUSH_EVENT_TEXT = {
  message: ['message', 'You have a new message.'],
  'appointment-update': ['appointment', 'Your appointment has been updated.'],
  'appointment-confirmed': ['appointment', 'Your appointment has been confirmed.'],
  'appointment-rescheduled': ['appointment', 'Your appointment has been updated.'],
  'appointment-reminder': ['appointment', 'You have an upcoming appointment.'],
  'assessment-published': ['assessment', 'A new assessment is available.'],
  announcement: ['system', 'You have a Spartan-G update.'],
} as const;
export type PushKind = keyof typeof PUSH_EVENT_TEXT;
export function pushText(category: PushCategory, kind?: PushKind): string | null {
  if (kind === undefined) return PUSH_TEXT[category] ?? null;
  const value = Object.prototype.hasOwnProperty.call(PUSH_EVENT_TEXT, kind) ? PUSH_EVENT_TEXT[kind] : null;
  return value?.[0] === category ? value[1] : null;
}
export interface PushEnvelope {
  version: 1;
  category: PushCategory;
  eventId: string;
  bindingId: string;
  issuedAt: number;
  expiresAt: number;
}
export interface PhonePreferences { phoneEnabled: boolean; messages: boolean; appointments: boolean; assessmentUpdates: boolean }
export const DEFAULT_PHONE_PREFERENCES: Readonly<PhonePreferences> = Object.freeze({ phoneEnabled: false, messages: true, appointments: true, assessmentUpdates: true });
export const opaqueId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{12,96}$/.test(value);
export function parsePushEnvelope(value: unknown, now: number): PushEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'bindingId,category,eventId,expiresAt,issuedAt,version'
    || v.version !== 1 || !PUSH_CATEGORIES.includes(v.category as PushCategory) || !opaqueId(v.eventId) || !opaqueId(v.bindingId)
    || !Number.isSafeInteger(v.issuedAt) || !Number.isSafeInteger(v.expiresAt)) return null;
  const start = v.issuedAt as number, end = v.expiresAt as number;
  if (!Number.isFinite(now) || start < 0 || start > now + 60_000 || end <= now || end <= start || end - start > 86_400_000) return null;
  return { version: 1, category: v.category as PushCategory, eventId: v.eventId, bindingId: v.bindingId, issuedAt: start, expiresAt: end };
}
export function validPhonePreferences(value: unknown): value is PhonePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).sort().join(',') === 'appointments,assessmentUpdates,messages,phoneEnabled'
    && Object.values(v).every(x => typeof x === 'boolean');
}
/** FCM HTTP v1 data values are strings. Decode only the exact existing envelope;
 * never coerce arbitrary payload fields, numeric whitespace or unknown versions. */
export function decodeFcmEnvelope(value: unknown, now: number): PushEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join(',') !== 'bindingId,category,eventId,expiresAt,issuedAt,version' || v.version !== '1'
    || typeof v.issuedAt !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(v.issuedAt)
    || typeof v.expiresAt !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(v.expiresAt)) return null;
  return parsePushEnvelope({ ...v, version: 1, issuedAt: Number(v.issuedAt), expiresAt: Number(v.expiresAt) }, now);
}
export function categoryEnabled(preferences: PhonePreferences | null, category: PushCategory): boolean {
  if (!validPhonePreferences(preferences) || !preferences.phoneEnabled) return false;
  return category === 'message' ? preferences.messages : category === 'appointment' ? preferences.appointments : category === 'assessment' ? preferences.assessmentUpdates : category === 'system';
}
/** Validate content too: a well-formed data envelope cannot make a private title safe. */
export function safePushContent(content: { title?: unknown; body?: unknown; data?: unknown; subtitle?: unknown; attachments?: unknown }, now: number): PushEnvelope | null {
  if ((content.subtitle !== undefined && content.subtitle !== null && content.subtitle !== '')
    || (content.attachments !== undefined && content.attachments !== null && (!Array.isArray(content.attachments) || content.attachments.length > 0))) return null;
  const envelope = parsePushEnvelope(content.data, now) ?? decodeFcmEnvelope(content.data, now);
  const safeBody = envelope && (content.body === PUSH_TEXT[envelope.category]
    || Object.values(PUSH_EVENT_TEXT).some(([category, text]) => category === envelope.category && text === content.body));
  return envelope && content.title === 'Spartan-G' && safeBody ? envelope : null;
}
