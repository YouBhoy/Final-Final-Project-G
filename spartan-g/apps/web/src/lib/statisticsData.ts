import type { ReportInput, Data } from '@spartan-g/shared-types';
import { createPseudonymizer } from './pseudonymization';

export const MAX_STATISTICS_RECORDS = 1000;
export const STATISTICS_FIELDS: Record<string, string[]> = {
  users: ['role', 'campus', 'createdAt', 'created_at'],
  campuses: ['key', 'label'],
  appointments: ['studentId', 'campus', 'status', 'createdAt', 'created_at'],
  messages: ['senderId', 'conversationId', 'campus', 'createdAt', 'created_at', 'type', 'status', 'isDeleted'],
  conversations: ['participantIds'],
  facilitator_student_links: ['facilitatorId', 'studentId', 'status', 'requestedAt', 'respondedAt'],
  assessment_attempts: ['studentId', 'assessmentId', 'campus', 'status', 'startedAt', 'started_at', 'createdAt', 'submittedAt', 'submitted_at', 'answers'],
  assessments: ['studentId', 'templateId', 'title', 'questions', 'analyticsScoringVersion', 'status', 'campus', 'submittedAt'],
};
export interface StatisticsSource {
  currentUid(): string | null;
  user(uid: string): Promise<{ role?: unknown; isActive?: unknown } | undefined>;
  records(collection: string, maximum: number): Promise<Data[]>;
}
export class StatisticsDataError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function calculationValue(field: string, value: any) {
  if (field === 'answers' && Array.isArray(value)) return value.map(answer => ({
    questionId: typeof answer?.questionId === 'string' ? answer.questionId : null,
    // Keep malformed entries/IDs for validation, but do not retain written responses.
    value: typeof answer?.value === 'string' && /^[0-3]$/.test(answer.value) || typeof answer?.value === 'number' && Number.isInteger(answer.value) && answer.value >= 0 && answer.value <= 3 ? answer.value : null,
  }));
  if (field === 'questions' && Array.isArray(value)) return value.map(question => ({
    id: question?.id, type: question?.type,
    options: Array.isArray(question?.options) ? question.options.map((option: any) => ({ id: option?.id })) : null,
  }));
  return value;
}
/** Only minimized, pseudonymized input stays in this account-bound memory cache. */
export function createStatisticsLoader(source: StatisticsSource, ttlMs = 5 * 60 * 1000) {
  let cached: { uid: string; input: ReportInput; loadedAt: number } | null = null;
  let pending: { uid: string; promise: Promise<ReportInput> } | null = null;
  let generation = 0;
  const snapshotTimes = new WeakMap<ReportInput, string>();
  const clear = () => { cached = null; pending = null; generation++; };
  const denied = () => new StatisticsDataError('permission-denied', 'Statistics requires an active super administrator.');
  async function authorized(uid: string) {
    if (source.currentUid() !== uid) throw denied();
    const user = await source.user(uid);
    if (source.currentUid() !== uid || user?.role !== 'super_admin' || user.isActive !== true) throw denied();
  }
  async function read(): Promise<ReportInput> {
    const alias = createPseudonymizer();
    const identity = (namespace: string, value: unknown) => typeof value === 'string' && value ? alias(namespace, value) : value;
    const entries = await Promise.all(Object.entries(STATISTICS_FIELDS).map(async ([name, fields]) => {
      const records = await source.records(name, MAX_STATISTICS_RECORDS + 1);
      if (records.length > MAX_STATISTICS_RECORDS) throw new StatisticsDataError('statistics/capacity', 'This report exceeds the browser reporting limit (1,000 records per collection). No partial totals are shown.');
      // Preserve the existing tie-break order for simultaneous attempts, without retaining IDs.
      const orderedIds = [...new Set(records.map(record => record.id))].sort((a, b) => a.localeCompare(b));
      const ranks = new Map(orderedIds.map((id, index) => [id, String(index).padStart(6, '0')]));
      const eventPrefix = alias('Event', name);
      return [name, records.map(record => {
        const row: Data = { id: record.id, ...Object.fromEntries(fields.filter(field => record[field] !== undefined).map(field => [field, calculationValue(field, record[field])])) };
        // Preserve public campus/template IDs, but replace account and event identifiers.
        if (name === 'users') row.id = identity('Account', row.id) as string;
        else if (name === 'conversations') row.id = identity('Conversation', row.id) as string;
        else if (name !== 'campuses' && !(name === 'assessments' && !('studentId' in row))) row.id = `${eventPrefix}-${ranks.get(record.id)}`;
        for (const field of ['studentId', 'facilitatorId', 'senderId']) {
          if (field in row) row[field] = identity('Account', row[field]);
        }
        if ('conversationId' in row) row.conversationId = identity('Conversation', row.conversationId);
        if (Array.isArray(row.participantIds)) row.participantIds = row.participantIds.map(value => identity('Account', value));
        if (name === 'facilitator_student_links' && record.id === `${record.facilitatorId}_${record.studentId}`) row.id = `${row.facilitatorId}_${row.studentId}`;
        return row;
      })] as const;
    }));
    const rows = Object.fromEntries(entries);
    return { users: rows.users, campuses: rows.campuses, appointments: rows.appointments, messages: rows.messages,
      conversations: rows.conversations, links: rows.facilitator_student_links, attempts: rows.assessment_attempts,
      definitions: rows.assessments.filter(row => !('studentId' in row)), legacyInstances: rows.assessments.filter(row => 'studentId' in row) };
  }
  async function input(forceRefresh = false): Promise<ReportInput> {
    const uid = source.currentUid(), requestGeneration = generation;
    if (!uid) { clear(); throw new StatisticsDataError('unauthenticated', 'Sign in required.'); }
    try {
      await authorized(uid);
      let result: ReportInput;
      if (!forceRefresh && cached?.uid === uid && Date.now() - cached.loadedAt < ttlMs) result = cached.input;
      else {
        const operation = pending?.uid === uid ? pending.promise : read();
        pending = { uid, promise: operation };
        try { result = await operation; }
        finally { if (pending?.promise === operation) pending = null; }
      }
      await authorized(uid);
      if (requestGeneration !== generation) throw denied();
      // Do not extend the lifetime when a cached snapshot is used.
      if (cached?.input !== result) cached = { uid, input: result, loadedAt: Date.now() };
      if (!snapshotTimes.has(result)) snapshotTimes.set(result, new Date(cached?.loadedAt ?? Date.now()).toISOString());
      return result;
    } catch (cause) {
      if (source.currentUid() === uid) clear();
      throw cause;
    }
  }
  return { input, clear, loadedAt: (input: ReportInput) => snapshotTimes.get(input) };
}
