import type { AssessmentAttemptDocument, AssessmentDefinitionDocument, ConversationDocument } from '@spartan-g/shared-types';

export type AssessmentListStatus = 'In progress' | 'Submitted' | 'Not started';
export type AssessmentListFilter = 'All' | 'In progress' | 'Submitted';
export const assessmentListFilters: AssessmentListFilter[] = ['All', 'In progress', 'Submitted'];

// Only owned attempts contribute to display metadata. Scoring/submission is untouched.
export function assessmentListStatus(assessmentId: string, studentId: string, attempts: AssessmentAttemptDocument[]): AssessmentListStatus {
  const owned = attempts.filter(a => a.assessmentId === assessmentId && a.studentId === studentId);
  if (owned.some(a => a.status === 'in_progress')) return 'In progress';
  if (owned.some(a => a.status === 'submitted' || a.status === 'graded')) return 'Submitted';
  return 'Not started';
}

export function filterAssessmentList<T extends AssessmentDefinitionDocument & { id: string }>(records: T[], search: string, filter: AssessmentListFilter, statuses: Record<string, AssessmentListStatus>): T[] {
  const term = search.trim().toLocaleLowerCase();
  return records.filter(a => a.isPublished && (!term || `${a.title} ${a.description ?? ''}`.toLocaleLowerCase().includes(term)) && (filter === 'All' || statuses[a.id] === filter));
}

export function filterConversationList<T extends ConversationDocument & { id: string }>(records: T[], uid: string, names: Record<string, string>, search: string, unreadOnly: boolean): T[] {
  const term = search.trim().toLocaleLowerCase();
  // Maintain the service's existing order; filtering never creates or fetches users.
  return records.filter(c => c.participantIds.includes(uid) && (!unreadOnly || (c.unreadCount?.[uid] ?? 0) > 0) && (!term || `${c.participantIds.filter(id => id !== uid).map(id => names[id] ?? '').join(' ')} ${c.lastMessagePreview ?? ''}`.toLocaleLowerCase().includes(term)));
}

export function conversationDateLabel(value: ConversationDocument['lastMessageAt'], now = new Date()): string {
  if (!value || typeof value.toDate !== 'function') return '';
  const date = value.toDate();
  if (!Number.isFinite(date.getTime())) return '';
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}
