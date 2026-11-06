// Read-only deterministic answers. No model, clinical interpretation, chat persistence or write port.
import type { AppointmentDocument } from '@spartan-g/shared-types';
export const SYSTEM_ASSISTANT_GREETING = "Hi! I'm Sparty. What would you like help with today? I can check your own app records and help you find support. I'm not a counselor.";
export const SYSTEM_ASSISTANT_SIGN_IN = 'Please sign in with your student account to use Sparty system help.';
export const SYSTEM_ASSISTANT_MAX_INPUT = 1000;
export type AssistantAction = 'appointments' | 'assessments' | 'messages' | 'facilitators' | 'garden' | 'forest' | 'resources' | 'profile';
export const ASSISTANT_CATEGORIES = [
  { title: 'My appointments', questions: ['Do I have an appointment today?', 'Do I have an appointment this week?', 'When is my next appointment?', 'How do I request an appointment?', 'Can I view my appointment history?'] },
  { title: 'My assessments', questions: ['Do I have assessments to take?', 'Do I have unfinished assessments?', 'What assessments have I completed?', 'How can I continue an assessment?', 'Where can I view my assessment history?'] },
  { title: 'My messages', questions: ['Do I have unread messages?', 'How do I contact my facilitator?', 'Where can I read my messages?'] },
  { title: 'Garden and Forest', questions: ['What is my current Garden level?', 'How much Garden XP do I have?', 'How many seeds have I earned?', 'How does My Garden work?', 'How does My Forest work?'] },
  { title: 'Wellness resources', questions: ['What can Spartan-G help me with?', 'How do I update my profile?', 'Where can I find wellness resources?', 'How can I contact the Guidance Office?'] },
] as const;
export interface SystemAssistantIdentity { uid: string; role: string; session?: unknown }
export interface SystemAssistantAppointment { id?: string; studentId: string; scheduledAt: unknown; status: AppointmentDocument['status'] }
export interface SystemAssistantAttempt { id?: string; studentId: string; status: string }
export interface SystemAssistantPorts {
  getIdentity: () => SystemAssistantIdentity | null;
  getAppointments: (uid: string) => Promise<readonly SystemAssistantAppointment[]>;
  getInProgressAssessments: (uid: string) => Promise<readonly SystemAssistantAttempt[]>;
  getCompletedAssessments?: (uid: string) => Promise<readonly SystemAssistantAttempt[]>;
  getPublishedAssessments?: () => Promise<readonly { id: string; isPublished: boolean }[]>;
  getConversations?: (uid: string) => Promise<readonly { id: string; participantIds: readonly string[]; unreadCount?: Record<string, number> }[]>;
  getGarden?: (uid: string) => Promise<{ studentId: string; level: number; xp: number; seeds: number } | null>;
  now?: () => Date; timeoutMs?: number;
}
export interface SystemAssistantReply {
  status: 'ok' | 'unsupported' | 'unavailable' | 'unauthorized'; text: string;
  actions?: readonly AssistantAction[]; error?: 'permission' | 'network' | 'timeout' | 'invalid' | 'unknown';
}
const STATUS: Record<AppointmentDocument['status'], string> = {
  accepted: 'confirmed', requested: 'awaiting facilitator acceptance (not confirmed)', reschedule_requested: 'rescheduling requested; original time is not confirmed',
  completed: 'marked completed', cancelled: 'cancelled', rejected: 'rejected', no_show: 'marked no-show',
};
const help = 'Choose a category below, or ask about your appointments, saved assessments, unread messages, Garden, or wellness resources.';
const ok = (text: string, ...actions: AssistantAction[]): SystemAssistantReply => ({ status: 'ok', text, actions });
const invalid = (): never => { throw Object.assign(new Error('Unverifiable record'), { code: 'invalid' }); };
const unique = <T extends { id?: string }>(records: readonly T[]) => { const seen = new Set<string>(); return records.filter(r => { if (!r.id) return true; if (seen.has(r.id)) return false; seen.add(r.id); return true; }); };
/** Philippine calendar; week is Monday 00:00 to next Monday 00:00, Asia/Manila (UTC+08). */
export function systemAssistantDay(now: Date) {
  if (!Number.isFinite(now.getTime())) return invalid();
  const local = new Date(now.getTime() + 8 * 3600000);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 8 * 3600000);
  return { start, end: new Date(start.getTime() + 86400000) };
}
export function systemAssistantWeek(now: Date) {
  const { start } = systemAssistantDay(now), weekday = new Date(start.getTime() + 8 * 3600000).getUTCDay();
  start.setTime(start.getTime() - ((weekday + 6) % 7) * 86400000);
  return { start, end: new Date(start.getTime() + 7 * 86400000) };
}
function appointmentDate(value: unknown): Date {
  let candidate: unknown = value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') candidate = value.toDate();
  let date: Date;
  if (candidate instanceof Date) date = new Date(candidate.getTime());
  else if (typeof candidate === 'number') date = new Date(candidate);
  else if (typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(candidate)) {
    const [y, m, d, h, min, sec = 0] = candidate.match(/^\d{4}|\d{2}/g)!.slice(0, 6).map(Number);
    const last = new Date(0); last.setUTCFullYear(y, m, 0);
    if (m < 1 || m > 12 || d < 1 || d > last.getUTCDate() || h > 23 || min > 59 || sec > 59) return invalid();
    date = new Date(candidate);
  } else return invalid();
  if (!Number.isFinite(date.getTime())) return invalid();
  return date;
}
const formatDate = (date: Date) => date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PHT';
async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Timeout'), { code: 'timeout' })), ms); })]); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}
export function createSystemAssistant(ports: SystemAssistantPorts) {
  const identity = () => { const current = ports.getIdentity(); return current?.role === 'student' && current.uid ? current : null; };
  return { async reply(message: string): Promise<SystemAssistantReply> {
    let owner: SystemAssistantIdentity | null = null;
    const stillOwner = () => { const c = identity(); return !!owner && c?.uid === owner.uid && c.role === owner.role && c.session === owner.session; };
    const read = async <T,>(operation: Promise<T>) => { const value = await bounded(operation, ports.timeoutMs ?? 12000); if (!stillOwner()) throw Object.assign(new Error('Session changed'), { code: 'unauthenticated' }); return value; };
    try {
      owner = identity();
      if (!owner) return { status: 'unauthorized', text: SYSTEM_ASSISTANT_SIGN_IN };
      if (!message.trim() || message.length > SYSTEM_ASSISTANT_MAX_INPUT) return { status: 'unsupported', text: 'Please use a short system question (up to 1,000 characters). ' + help };
      const q = message.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
      if (/\b(suicid\w*|self[- ]?harm|kill myself|hurt myself|end my life|unsafe|in danger)\b/.test(q)) return ok("I'm sorry you're going through this. Sparty cannot assess your safety or provide crisis care. If you might act on these feelings or are in immediate danger, contact local emergency services or go to the nearest emergency department. Reach out to a trusted person who can stay with you and your institution's Guidance Office. Resources and Facilitators can help you find support; I cannot contact them for you.", 'resources', 'facilitators');
      if (/\b(another|someone|somebody|other student|other user|their|his|her)\b|\b(student|user)\s*(id|uid)\b|\buid\s*[:=]|\b\w+'s\s+(?:(?:next|pending|upcoming|saved)\s+)*(appointments?|assessments?|records?|history|garden|messages?)\b/.test(q)) return { status: 'unauthorized', text: "I can only check the signed-in student's own records." };
      if (/\b(diagnos\w*|scores?|risk|severity|screening results?|counseling details|medical advice)\b/.test(q)) return ok('I cannot diagnose, interpret screening results, or assess risk. A qualified professional can help you understand your concerns. Open Resources or contact a facilitator.', 'resources', 'facilitators');
      if (/\b(appointments?|meetings?|schedule)\b/.test(q)) {
        if (/\b(how|where|can i)\b/.test(q) && /\b(request|book)\b/.test(q)) return ok('Open Facilitators, choose an available facilitator, and request a suitable appointment. A request is not confirmed until accepted. I cannot book it for you.', 'facilitators', 'appointments');
        if (/\bhistory\b/.test(q)) return ok('Open My Appts to review appointment statuses, including completed, cancelled and rescheduling entries.', 'appointments');
        const period = /\btoday\b/.test(q) ? 'today' : /\bthis week\b/.test(q) ? 'week' : /\b(next|upcoming)\b/.test(q) ? 'next' : null;
        if (period && !/\b(cancel|delete|change|reschedule|tomorrow|next week|last week)\b/.test(q)) {
          const now = ports.now?.() ?? new Date(); systemAssistantDay(now);
          const records = await read(ports.getAppointments(owner.uid));
          const entries = records.map(r => { if (r.studentId !== owner!.uid || !Object.prototype.hasOwnProperty.call(STATUS, r.status)) return invalid(); return { ...r, date: appointmentDate(r.scheduledAt) }; });
          const appointments = unique(entries).sort((a, b) => a.date.getTime() - b.date.getTime());
          if (period === 'next') {
            const next = appointments.find(r => r.date >= now && ['accepted', 'requested'].includes(r.status));
            const rescheduling = appointments.some(r => r.status === 'reschedule_requested') ? ' A rescheduling request is also pending; its original date is not a confirmed new time.' : '';
            return ok(next ? `Your next ${next.status === 'accepted' ? 'confirmed appointment' : 'pending appointment request'} is ${formatDate(next.date)}: ${STATUS[next.status]}.${rescheduling}` : `No upcoming accepted appointments or pending appointment requests were found.${rescheduling} Completed, cancelled, rejected and no-show entries are excluded.`, 'appointments');
          }
          const { start, end } = period === 'today' ? systemAssistantDay(now) : systemAssistantWeek(now);
          const found = appointments.filter(r => r.date >= start && r.date < end);
          const label = period === 'today' ? 'today (Philippine time)' : 'this week (Monday–Sunday, Philippine time)';
          return ok(found.length ? `Your records for ${label}:\n${found.slice(0, 6).map(r => `• ${formatDate(r.date)}: ${STATUS[r.status]}.`).join('\n')}${found.length > 6 ? '\nOpen My Appts for the remaining entries.' : ''}\nOnly confirmed entries are accepted appointments.` : `No appointments dated ${label} were found. Check My Appts for other dates.`, 'appointments');
        }
      } else if (/\b(assessments?|check-ins?|questionnaires?)\b/.test(q)) {
        if (/\b(history|where|how|continue|resume)\b/.test(q)) return ok(/history/.test(q) ? 'Open Garden, then My Forest for your submitted check-in history. Details remain in the existing canonical records.' : 'Open Assessments and choose the same questionnaire to resume its available saved draft. Submission remains disabled in this presentation version.', 'assessments', 'forest');
        if (/\b(completed|finished)\b/.test(q) && !/unfinished/.test(q) && ports.getCompletedAssessments) {
          const records = await read(ports.getCompletedAssessments(owner.uid));
          if (records.some(r => r.studentId !== owner!.uid || !['submitted', 'graded'].includes(r.status))) return invalid();
          return ok(`Your account has ${unique(records).length} submitted or graded assessment attempt(s). Repeat attempts are separate records, not unique questionnaires or clinical achievements. Open My Forest for history; I do not interpret scores.`, 'forest');
        }
        if (/\b(to take|available|published)\b/.test(q) && ports.getPublishedAssessments) {
          const records = await read(ports.getPublishedAssessments());
          if (records.some(r => !r.id || r.isPublished !== true)) return invalid();
          return ok(`${unique(records).length} published questionnaire(s) are available in the catalog. This is not a list of required assignments and does not establish which you still need to complete. Submission remains disabled.`, 'assessments');
        }
        if (/\b(pending|in progress|in-progress|unfinished|incomplete)\b/.test(q)) {
          const records = await read(ports.getInProgressAssessments(owner.uid));
          if (records.some(r => r.studentId !== owner!.uid || r.status !== 'in_progress')) return invalid();
          return ok(`${unique(records).length} saved in-progress assessment(s) were found. These are saved attempts, not required assignments. Open Assessments to resume an available draft.`, 'assessments');
        }
      } else if (/\b(facilitators?|guidance office)\b/.test(q)) return ok('Open Facilitators to find available guidance staff and request an appointment. Use Messages for your existing authorized conversations. Institutional contact details are not verified here; check Resources or your campus guidance office.', 'facilitators', 'messages', 'resources');
      else if (/\bmessages?\b/.test(q)) {
        if (/\bunread\b/.test(q) && ports.getConversations) {
          const records = await read(ports.getConversations(owner.uid));
          if (records.some(r => !r.id || !Array.isArray(r.participantIds) || !r.participantIds.includes(owner!.uid) || r.unreadCount !== undefined && (r.unreadCount === null || typeof r.unreadCount !== 'object' || Array.isArray(r.unreadCount)))) return invalid();
          if (records.some(r => r.unreadCount === undefined)) return ok('Some conversations do not have a reliable unread counter. Open Messages to review them; I cannot give a verified total.', 'messages');
          const counts = unique(records).map(r => Object.prototype.hasOwnProperty.call(r.unreadCount, owner!.uid) ? r.unreadCount![owner!.uid] : 0);
          if (counts.some(n => !Number.isSafeInteger(n) || n < 0)) return invalid();
          const total = counts.reduce((a, b) => a + b, 0); if (!Number.isSafeInteger(total)) return invalid();
          return ok(`${total} unread message(s) are recorded across your conversations. Counts can change as messages arrive or are read. No message contents were included in this answer.`, 'messages');
        }
        return ok('Open Messages to read your existing authorized conversations. I cannot send messages for you.', 'messages');
      } else if (/\b(garden|forest|seeds?|xp)\b/.test(q)) {
        if (/\b(level|xp|seeds?)\b/.test(q) && ports.getGarden) {
          const garden = await read(ports.getGarden(owner.uid));
          if (!garden) return ok('No saved Garden was found for your account. I have not created one or awarded progress.', 'garden');
          if (garden.studentId !== owner.uid || !Number.isSafeInteger(garden.level) || garden.level < 1 || [garden.xp, garden.seeds].some(n => !Number.isSafeInteger(n) || n < 0)) return invalid();
          return ok(`Your saved Garden: level ${garden.level}, ${garden.xp} current XP, ${garden.seeds} seed balance. The balance is not lifetime earnings. This is a read only; no progress or rewards were changed.`, 'garden');
        }
        return ok('Garden shows your saved tree and progression. My Forest displays your submitted check-in history and your own reflection notes. Rewards and watering remain unavailable in this presentation version; I cannot award XP or seeds.', 'garden', 'forest');
      } else if (/\bprofile\b/.test(q)) return ok('Open Profile to view your account and Settings. Personal account editing is not supported in this mobile version; contact authorized campus staff for corrections.', 'profile');
      else if (/\b(resources?|wellness|support)\b/.test(q)) return ok('Resources contains educational wellbeing information and guidance on institutional support. It does not replace professional care.', 'resources', 'facilitators');
      else if (/^(hi|hello|hey|thanks|thank you)[!.?\s]*$/.test(q) || /\b(help|what can)\b/.test(q)) return ok(help, 'resources');
      return { status: 'unsupported', text: "I can't answer that reliably in system-help mode. I don't interpret wellness scores or provide clinical advice. " + help };
    } catch (error) {
      try { if (!stillOwner()) return { status: 'unauthorized', text: SYSTEM_ASSISTANT_SIGN_IN }; } catch { return { status: 'unauthorized', text: SYSTEM_ASSISTANT_SIGN_IN }; }
      const code = String((error as { code?: unknown })?.code ?? '').replace(/^(firestore|auth)\//, '');
      if (code === 'unauthenticated') return { status: 'unauthorized', text: SYSTEM_ASSISTANT_SIGN_IN };
      const reason = ['permission-denied', 'PERMISSION_DENIED'].includes(code) ? 'permission' : ['unavailable', 'network-request-failed', 'network', 'deadline-exceeded'].includes(code) ? 'network' : code === 'timeout' ? 'timeout' : code === 'invalid' ? 'invalid' : 'unknown';
      const text = reason === 'permission' ? 'Access was denied. Please sign in again or contact authorized support.' : reason === 'network' ? 'The network is unavailable. Please check your connection and try again.' : reason === 'timeout' ? 'The request timed out. Please try again when your connection is stable.' : "I couldn't safely verify those records. Please open the relevant screen or try again.";
      return { status: 'unavailable', error: reason, text: text + ' No records were changed; a failed query is not a zero count.' };
    }
  } };
}
