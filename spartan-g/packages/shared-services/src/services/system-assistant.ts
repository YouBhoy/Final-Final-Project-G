// Deterministic, read-only system help. No model, provider, chat persistence or write port.
import type { AppointmentDocument } from '@spartan-g/shared-types';

export const SYSTEM_ASSISTANT_GREETING = "Hi! I'm Sparty. I can check your appointments and saved in-progress assessments, or help you find your history, a facilitator, and the Garden. I don't use generative AI in this mode.";
export const SYSTEM_ASSISTANT_SIGN_IN = 'Please sign in with your student account to use Sparty system help.';
export const SYSTEM_ASSISTANT_MAX_INPUT = 1000;

export interface SystemAssistantIdentity { uid: string; role: string }
export interface SystemAssistantAppointment {
  studentId: string;
  scheduledAt: unknown;
  status: AppointmentDocument['status'];
}
export interface SystemAssistantAttempt { studentId: string; status: string }
export interface SystemAssistantPorts {
  getIdentity: () => SystemAssistantIdentity | null;
  getAppointments: (uid: string) => Promise<readonly SystemAssistantAppointment[]>;
  getInProgressAssessments: (uid: string) => Promise<readonly SystemAssistantAttempt[]>;
  now?: () => Date;
  timeoutMs?: number;
}
export interface SystemAssistantReply {
  status: 'ok' | 'unsupported' | 'unavailable' | 'unauthorized';
  text: string;
}
type Intent = 'week' | 'next' | 'pending' | 'history' | 'contact' | 'garden' | 'help' | 'greeting' | 'other-user' | 'unsupported';

const HELP = 'Try asking: "Do I have appointments this week?", "What is my next appointment?", "Do I have pending assessments?", "Where is my assessment history?", "How do I contact a facilitator?", or "What can I do in the Garden?"';
const STATUS: Record<AppointmentDocument['status'], string> = {
  accepted: 'confirmed', requested: 'awaiting facilitator acceptance (not confirmed)',
  reschedule_requested: 'rescheduling requested; original time is not confirmed',
  completed: 'marked completed', cancelled: 'cancelled', rejected: 'rejected', no_show: 'marked no-show',
};

function intentOf(message: string): Intent {
  const q = message.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
  // Questions never supply a UID. Ambiguous/third-party requests must not imply cross-user access.
  if (/\b(another|someone|somebody|other student|other user|their|his|her)\b/.test(q)
      || /\b(student|user)\s*(id|uid)\b|\buid\s*[:=]/.test(q)
      || /\b\w+'s\s+(?:(?:next|pending|upcoming|saved)\s+)*(appointments?|assessments?|records?|history)\b/.test(q)) return 'other-user';
  if (/\b(appointments?|meetings?|schedule)\b/.test(q)) {
    if (/\b(cancel|book|change|reschedule|delete|tomorrow|today|next week|last week)\b/.test(q)) return 'unsupported';
    if (/\bthis week\b/.test(q)) return 'week';
    if (/\b(next|upcoming)\b/.test(q)) return 'next';
    return 'unsupported';
  }
  if (/\b(assessments?|check-ins?|questionnaires?)\b/.test(q)) {
    if (/\b(history|previous|past)\b/.test(q) && /\b(where|find|view|see|access)\b/.test(q)) return 'history';
    if (/\b(pending|in progress|in-progress|unfinished|incomplete|left to (do|finish))\b/.test(q)) return 'pending';
    return 'unsupported';
  }
  if (/\bfacilitators?\b/.test(q) && /\b(contact|message|reach|find|talk|speak|connect)\b/.test(q)) return 'contact';
  if (/\b(garden|forest)\b/.test(q)) return 'garden';
  if (/^(hi|hello|hey|thanks|thank you)[!.?\s]*$/.test(q)) return 'greeting';
  if (/^(help|what can you do|how can you help|what can i ask)[!.?\s]*$/.test(q)) return 'help';
  return 'unsupported';
}

/** Monday 00:00 inclusive to the following Monday 00:00 exclusive, device local time.
 * Calendar arithmetic deliberately preserves DST transitions instead of adding 7 * 24h.
 */
export function systemAssistantWeek(now: Date): { start: Date; end: Date } {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid local clock');
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function appointmentDate(value: unknown): Date {
  let candidate: unknown = value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') candidate = value.toDate();
  let date: Date;
  if (candidate instanceof Date) date = new Date(candidate.getTime());
  else if (typeof candidate === 'number') date = new Date(candidate);
  // Offset-bearing ISO only; reject ambiguous strings in a different timezone.
  else if (typeof candidate === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(candidate)) {
    const [year, month, day, hour, minute, second = 0] = candidate.match(/^\d{4}|\d{2}/g)!.slice(0, 6).map(Number);
    const lastDay = new Date(0); lastDay.setUTCFullYear(year, month, 0);
    if (month < 1 || month > 12 || day < 1 || day > lastDay.getUTCDate() || hour > 23 || minute > 59 || second > 59) throw new Error('Unverifiable appointment date');
    date = new Date(candidate);
  }
  else throw new Error('Unverifiable appointment date');
  if (!Number.isFinite(date.getTime())) throw new Error('Unverifiable appointment date');
  return date;
}

const formatDate = (date: Date) => date.toLocaleString(undefined, {
  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});
const ok = (text: string): SystemAssistantReply => ({ status: 'ok', text });
const unavailable = (): SystemAssistantReply => ({ status: 'unavailable', text: "I couldn't verify that information right now. Please check My Appts or Assessments, or try asking me again. I haven't changed any records." });

async function bounded<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Read timed out')), timeoutMs); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export function createSystemAssistant(ports: SystemAssistantPorts) {
  const identity = (): SystemAssistantIdentity | null => {
    const current = ports.getIdentity();
    return current?.role === 'student' && current.uid ? current : null;
  };
  return {
    async reply(message: string): Promise<SystemAssistantReply> {
      let owner: SystemAssistantIdentity | null = null;
      const stillOwner = () => {
        const current = identity();
        return !!owner && current?.uid === owner.uid && current.role === owner.role;
      };
      try {
        owner = identity();
        if (!owner) return { status: 'unauthorized', text: SYSTEM_ASSISTANT_SIGN_IN };
        if (!message.trim() || message.length > SYSTEM_ASSISTANT_MAX_INPUT) return { status: 'unsupported', text: 'Please send a short system question (up to 1,000 characters). ' + HELP };
        const intent = intentOf(message);
        if (intent === 'other-user') return { status: 'unauthorized', text: "I can only check the signed-in student's own records. Please ask about your appointments or assessments." };
        if (intent === 'greeting') return ok('Hi! Happy to help you find your way around Spartan-G. ' + HELP);
        if (intent === 'help') return ok(HELP);
        if (intent === 'history') return ok('Open Garden, then tap My Forest to see your submitted check-in history and its trees. Open a tree for the available details. For published questionnaires, use the Assessments tab. I have not checked or changed your completion status.');
        if (intent === 'contact') return ok('Open the Facilitators tab to find an available facilitator and request an appointment. After an appointment is accepted, use Messages to open your conversation. Check My Appts for appointment status. I cannot send a message or book an appointment for you.');
        if (intent === 'garden') return ok('In Garden you can view your current tree, level, XP and seeds. Tap My Forest to see your check-in history and manage your own reflection notes. Garden rewards and watering are unavailable in this private version; I cannot award XP, spend seeds or water your tree.');
        if (intent === 'unsupported') return { status: 'unsupported', text: "I can help with Spartan-G system questions, but I can't answer that reliably in this mode. I can't interpret wellness scores or provide clinical advice. " + HELP };
        const now = ports.now?.() ?? new Date();
        if (!Number.isFinite(now.getTime())) return unavailable();
        if (intent === 'pending') {
          const attempts = await bounded(ports.getInProgressAssessments(owner.uid), ports.timeoutMs ?? 12000);
          if (!stillOwner()) return { status: 'unauthorized', text: SYSTEM_ASSISTANT_SIGN_IN };
          if (attempts.some(attempt => attempt.studentId !== owner?.uid || attempt.status !== 'in_progress')) return unavailable();
          return ok(attempts.length
            ? `You have ${attempts.length} saved in-progress assessment${attempts.length === 1 ? '' : 's'}. Open Assessments and choose the same questionnaire to resume an available saved attempt. These are saved attempts, not a list of required assignments.`
            : "I found no saved in-progress assessments for your account. That doesn't mean every assessment is completed. Open Assessments to see the published questionnaires available to you.");
        }
        const records = await bounded(ports.getAppointments(owner.uid), ports.timeoutMs ?? 12000);
        if (!stillOwner()) return { status: 'unauthorized', text: SYSTEM_ASSISTANT_SIGN_IN };
        // Fail closed on unexpected ownership/schema rather than disclose data or report a false empty state.
        const appointments = records.map(record => {
          if (record.studentId !== owner?.uid || !Object.prototype.hasOwnProperty.call(STATUS, record.status)) throw new Error('Unverifiable appointment');
          return { date: appointmentDate(record.scheduledAt), status: record.status };
        }).sort((a, b) => a.date.getTime() - b.date.getTime());
        if (intent === 'week') {
          const { start, end } = systemAssistantWeek(now);
          const found = appointments.filter(item => item.date >= start && item.date < end);
          const lastDay = new Date(end); lastDay.setDate(lastDay.getDate() - 1);
          const week = `${start.toLocaleDateString()} to ${lastDay.toLocaleDateString()} (Monday-Sunday, device local time)`;
          if (!found.length) return ok(`I found no appointments dated this week: ${week}. Check My Appts for changes or other dates.`);
          const lines = found.slice(0, 6).map(item => `- ${formatDate(item.date)}: ${STATUS[item.status]}${item.date < now ? ' (earlier this week)' : ''}.`);
          return ok(`Here's what your appointment records show for ${week}:\n${lines.join('\n')}${found.length > 6 ? `\nThere are ${found.length - 6} more; open My Appts for the full list.` : ''}\nOnly entries marked confirmed are accepted appointments. Check My Appts for the latest details.`);
        }
        const next = appointments.find(item => item.date >= now && (item.status === 'accepted' || item.status === 'requested'));
        if (next) return ok(`${next.status === 'accepted' ? 'Your next accepted appointment' : 'Your earliest upcoming appointment request'} is ${formatDate(next.date)}: ${STATUS[next.status]}. Times use your device's local timezone. Check My Appts for details.${appointments.some(item => item.status === 'reschedule_requested') ? ' You also have an appointment awaiting rescheduling; its original time is not a confirmed new time.' : ''}`);
        if (appointments.some(item => item.status === 'reschedule_requested')) return ok('I found an appointment awaiting rescheduling, but no upcoming accepted appointment or pending request with a usable time. Its original time is not a confirmed new time. Open My Appts to review it.');
        return ok('I found no upcoming accepted appointments or pending appointment requests. Cancelled, rejected, completed and no-show entries are not treated as upcoming appointments. You can review My Appts or find a facilitator in the Facilitators tab.');
      } catch {
        // Never expose backend errors, document paths, notes, scores or credentials in chat/logs.
        try { if (!stillOwner()) return { status: 'unauthorized', text: SYSTEM_ASSISTANT_SIGN_IN }; } catch { /* fail closed */ }
        return unavailable();
      }
    },
  };
}
