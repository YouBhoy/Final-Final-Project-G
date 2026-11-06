import type { AssessmentAttemptDocument, AppointmentDocument, ConversationDocument } from '@spartan-g/shared-types';

type Attempt = AssessmentAttemptDocument & { id: string };
export type JourneyPhase = 'start' | 'in_progress' | 'complete';

function millis(value: unknown): number {
  try {
    const date = value as { toMillis?: () => number; toDate?: () => Date } | undefined;
    const time = date?.toMillis?.() ?? date?.toDate?.()?.getTime() ?? 0;
    return Number.isFinite(time) ? time : 0;
  } catch { return 0; }
}

/** Counts actual attempts, as History does. A current draft takes precedence
 * over older completions; a completed attempt never completes a newer draft. */
export function assessmentJourney(uid: string, completed: Attempt[], drafts: Attempt[]) {
  const unique = (rows: Attempt[]) => [...new Map(rows.filter(row => row.studentId === uid && !!row.id).map(row => [row.id, row])).values()];
  const confirmed = unique(completed).filter(row => row.status === 'submitted' || row.status === 'graded');
  const confirmedIds = new Set(confirmed.map(row => row.id));
  // A draft read may precede an atomic finalization observed by the other read.
  // Finalized evidence is immutable; the same attempt must not count twice.
  const pending = unique(drafts).filter(row => row.status === 'in_progress' && !confirmedIds.has(row.id)).sort((a, b) =>
    (millis(b.updatedAt) || millis(b.startedAt)) - (millis(a.updatedAt) || millis(a.startedAt)) || a.id.localeCompare(b.id));
  const phase: JourneyPhase = pending.length ? 'in_progress' : confirmed.length ? 'complete' : 'start';
  return { completed: confirmed.length, inProgress: pending.length, phase, resumeAttemptId: pending[0]?.id ?? null };
}

export function nextStudentAppointment(uid: string, appointments: (AppointmentDocument & { id: string })[], now = new Date()): string | null {
  const next = appointments.filter(row => row.studentId === uid && ['accepted', 'requested'].includes(row.status) && millis(row.scheduledAt) > now.getTime())
    .sort((a, b) => millis(a.scheduledAt) - millis(b.scheduledAt))[0];
  if (!next) return null;
  const date = new Date(millis(next.scheduledAt));
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const day = date.toDateString() === now.toDateString() ? 'Today' : date.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
}

export function studentUnreadMessages(uid: string, conversations: (ConversationDocument & { id: string })[]): number {
  return conversations.filter(row => Array.isArray(row.participantIds) && row.participantIds.includes(uid)).reduce((sum, row) => {
    const count = row.unreadCount?.[uid];
    return sum + (Number.isSafeInteger(count) && (count ?? 0) > 0 ? count! : 0);
  }, 0);
}
