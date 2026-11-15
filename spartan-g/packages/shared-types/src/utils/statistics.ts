import { evaluateReferralForecast } from './referralForecast';

/** Browser-safe reporting code. No database access and no individual records in output. */
export type Data = Record<string, any> & { id: string };
export interface ReportFilters { startDate: string; endDate: string; campus: string; assessmentId: string; interval: 'daily' | 'weekly' | 'monthly' }
export interface ReportInput { users: Data[]; campuses: Data[]; appointments: Data[]; messages: Data[]; conversations: Data[]; links: Data[]; attempts: Data[]; definitions: Data[]; legacyInstances: Data[] }
export interface AttemptValidation {
  valid: boolean;
  logicalKey: string | null;
  issues: ('missing_required_fields' | 'invalid_status' | 'invalid_timestamp' | 'invalid_attempt_number' | 'identity_mismatch')[];
  startedAt: number | null;
  submittedAt: number | null;
}
const DAY = 86400000;
const OFFSET = 8 * 3600000;
const UNKNOWN = '__unknown__';
export const MIN_SCORE_GROUP = 5;
export function timestamp(value: any): number | null {
  let time: number;
  if (value && typeof value.toMillis === 'function') time = value.toMillis();
  else if (value instanceof Date) time = value.getTime();
  else if (typeof value === 'string') time = Date.parse(value);
  else return null;
  return Number.isFinite(time) ? time : null;
}
const ATTEMPT_STATUSES = new Set(['in_progress', 'submitted', 'graded']);
export function validateAssessmentAttempt(attempt: Data): AttemptValidation {
  const issues: AttemptValidation['issues'] = [];
  const assessmentId = typeof attempt.assessmentId === 'string' && attempt.assessmentId.trim() ? attempt.assessmentId : null;
  const studentId = typeof attempt.studentId === 'string' && attempt.studentId.trim() ? attempt.studentId : null;
  if (!assessmentId || !studentId) issues.push('missing_required_fields');
  if (typeof attempt.status !== 'string' || !ATTEMPT_STATUSES.has(attempt.status)) issues.push('invalid_status');
  const startedAt = timestamp(attempt.startedAt) ?? timestamp(attempt.started_at);
  const submittedAt = timestamp(attempt.submittedAt) ?? timestamp(attempt.submitted_at);
  if (startedAt === null || (['submitted', 'graded'].includes(attempt.status) && submittedAt === null)) issues.push('invalid_timestamp');
  const number = attempt.attemptNumber;
  if (!Number.isInteger(number) || number < 1) issues.push('invalid_attempt_number');
  const logicalKey = assessmentId && studentId && Number.isInteger(number) && number >= 1
    ? `${assessmentId}\u0000${studentId}\u0000${number}` : null;
  if (logicalKey && attempt.id !== `${assessmentId}_${studentId}_${number}`) issues.push('identity_mismatch');
  // Report ID mismatches without rejecting otherwise well-formed records: the
  // browser report loader pseudonymizes document IDs while preserving fields.
  return { valid: !issues.some(issue => issue !== 'identity_mismatch'), logicalKey, issues, startedAt, submittedAt };
}
export function dateBoundary(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use dates in YYYY-MM-DD format.');
  const time = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(time) || new Date(time + OFFSET).toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date.');
  return time;
}
export function validateFilters(value: any): ReportFilters {
  const start = dateBoundary(value?.startDate), end = dateBoundary(value?.endDate) + DAY;
  if (end <= start || end - start > 366 * DAY) throw new Error('Choose an ordered date range of at most 366 days.');
  if (!['daily', 'weekly', 'monthly'].includes(value?.interval)) throw new Error('Choose daily, weekly or monthly trends.');
  for (const key of ['campus', 'assessmentId']) if (typeof value?.[key] !== 'string' || value[key].length > 200 || value[key].includes('/')) throw new Error('Invalid report filter.');
  return { startDate: value.startDate, endDate: value.endDate, campus: value.campus, assessmentId: value.assessmentId, interval: value.interval };
}
const items = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
export const SCALES = [
  { key: 'PHQ-9', ids: items('phq', 9), max: 27, multiplier: 1 },
  { key: 'GAD-7', ids: items('gad', 7), max: 21, multiplier: 1 },
  { key: 'DASS-21 depression', ids: [3, 5, 10, 13, 16, 17, 21].map(i => `dass${i}`), max: 42, multiplier: 2 },
  { key: 'DASS-21 anxiety', ids: [2, 4, 7, 9, 15, 19, 20].map(i => `dass${i}`), max: 42, multiplier: 2 },
  { key: 'DASS-21 stress', ids: [1, 6, 8, 11, 12, 14, 18].map(i => `dass${i}`), max: 42, multiplier: 2 },
];
/** A trusted definition must declare the numeric 0..3 options for every item. */
export function validatedScore(attempt: Data, definition: Data | undefined, scale: typeof SCALES[number]): number | null {
  if (!definition || !Array.isArray(definition.questions) || !Array.isArray(attempt.answers)) return null;
  const questions = new Map<string, any>();
  for (const q of definition.questions) {
    if (!q || typeof q.id !== 'string' || questions.has(q.id)) return null;
    questions.set(q.id, q);
  }
  const answers = new Map<string, any>();
  for (const answer of attempt.answers) {
    if (!answer || typeof answer.questionId !== 'string' || answers.has(answer.questionId) || !questions.has(answer.questionId)) return null;
    answers.set(answer.questionId, answer.value);
  }
  let total = 0;
  for (const id of scale.ids) {
    const q = questions.get(id), value = answers.get(id);
    if (q?.type !== 'multiple_choice' || !Array.isArray(q.options) || q.options.length !== 4 ||
      new Set(q.options.map((o: any) => o?.id)).size !== 4 || !['0', '1', '2', '3'].every(v => q.options.some((o: any) => o?.id === v))) return null;
    if (!((typeof value === 'string' && /^[0-3]$/.test(value)) || (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3))) return null;
    total += Number(value);
  }
  return total * scale.multiplier;
}
const localDate = (time: number) => new Date(time + OFFSET).toISOString().slice(0, 10);
function bucketStart(time: number, interval: string) {
  const local = new Date(time + OFFSET);
  if (interval === 'daily') return dateBoundary(localDate(time));
  if (interval === 'monthly') return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET;
  return dateBoundary(localDate(time)) - ((local.getUTCDay() + 6) % 7) * DAY;
}
const nextBucket = (time: number, interval: string) => interval === 'daily' ? time + DAY : interval === 'weekly' ? time + 7 * DAY : (() => {
  const local = new Date(time + OFFSET);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) - OFFSET;
})();
const quantile = (sorted: number[], p: number) => {
  const position = (sorted.length - 1) * p, lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

/** Request cohorts use creation dates; statuses describe the fetched snapshot, not past decisions. */
function referralStatistics(input: ReportInput, filters: ReportFilters, now: Date) {
  const start = dateBoundary(filters.startDate), end = dateBoundary(filters.endDate) + DAY;
  const observedEnd = Math.min(end, now.getTime());
  const statusDefinitions = [
    ['requested', 'Pending'], ['accepted', 'Accepted'], ['rejected', 'Declined'],
    ['reschedule_requested', 'Awaiting reschedule'], ['completed', 'Completed'],
    ['cancelled', 'Cancelled'], ['no_show', 'No-show'], ['unknown', 'Unrecognized status'],
  ] as const;
  const counts = new Map<string, number>(statusDefinitions.map(([key]) => [key, 0]));
  const students = new Set<string>(), accounts = new Map(input.users.map(user => [user.id, user.role]));
  const dates: number[] = [];
  let firstObserved = Infinity;
  const coverage = { missingRequestDates: 0, futureDatedRequests: 0, missingCampusSnapshots: 0,
    missingStudentIds: 0, unknownStudentAccounts: 0, conflictingDates: 0, legacyDateFallbacks: 0 };
  for (const request of input.appointments) {
    // Current student campus must not silently rewrite historical referral attribution.
    const campus = typeof request.campus === 'string' && request.campus.trim() ? request.campus : UNKNOWN;
    if (filters.campus && campus !== filters.campus) continue;
    const canonical = timestamp(request.createdAt), legacy = timestamp(request.created_at);
    const created = canonical ?? legacy;
    if (created === null) { coverage.missingRequestDates++; continue; }
    if (created < now.getTime()) firstObserved = Math.min(firstObserved, created);
    if (created < start || created >= end) continue;
    if (created >= observedEnd) { coverage.futureDatedRequests++; continue; }
    dates.push(created);
    if (canonical !== null && legacy !== null && canonical !== legacy) coverage.conflictingDates++;
    if (canonical === null) coverage.legacyDateFallbacks++;
    if (campus === UNKNOWN) coverage.missingCampusSnapshots++;
    if (typeof request.studentId === 'string' && request.studentId.trim()) {
      students.add(request.studentId);
      if (accounts.get(request.studentId) !== 'student') coverage.unknownStudentAccounts++;
    } else coverage.missingStudentIds++;
    const key = statusDefinitions.find(([key]) => key !== 'unknown' && key === request.status)?.[0] ?? 'unknown';
    counts.set(key, counts.get(key)! + 1);
  }
  const bucketCounts = new Map<number, number>();
  for (const date of dates) {
    const bucket = bucketStart(date, filters.interval);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }
  const trends = [];
  for (let bucket = bucketStart(start, filters.interval); start < observedEnd && bucket < observedEnd; bucket = nextBucket(bucket, filters.interval)) {
    const next = nextBucket(bucket, filters.interval);
    trends.push({ label: filters.interval === 'monthly' ? localDate(bucket).slice(0, 7) : localDate(bucket),
      startDate: localDate(Math.max(start, bucket)), endDate: localDate(Math.min(next, observedEnd) - 1),
      partial: bucket < start || next > observedEnd, requests: bucketCounts.get(bucket) ?? 0 });
  }
  // Weekly modeling is independent of chart interval. Exclude the first observed week
  // (logging start unknown), clipped filter weeks and the unfinished current week.
  const weeklyCounts = new Map<number, number>();
  for (const date of dates) {
    const week = bucketStart(date, 'weekly');
    weeklyCounts.set(week, (weeklyCounts.get(week) ?? 0) + 1);
  }
  const weeks = [];
  if (Number.isFinite(firstObserved)) {
    const earliest = Math.max(start, bucketStart(firstObserved, 'weekly') + 7 * DAY);
    for (let week = bucketStart(earliest, 'weekly'); week + 7 * DAY <= observedEnd; week += 7 * DAY) {
      if (week >= earliest) weeks.push({ weekStart: localDate(week), requests: weeklyCounts.get(week) ?? 0 });
    }
  }
  const forecast = evaluateReferralForecast(weeks, coverage.missingRequestDates || coverage.conflictingDates
    ? 'Resolve missing or conflicting request creation dates before evaluating a forecast.' : undefined);
  return { forecast, requests: dates.length, requestingStudents: students.size, pending: counts.get('requested')!,
    accepted: counts.get('accepted')!, statuses: statusDefinitions.map(([key, label]) => ({ key, label, requests: counts.get(key)! })),
    trends, coverage };
}

export function buildStatistics(input: ReportInput, rawFilters: ReportFilters, now = new Date()) {
  const filters = validateFilters(rawFilters), start = dateBoundary(filters.startDate), end = dateBoundary(filters.endDate) + DAY;
  const observedEnd = Math.min(end, now.getTime());
  const coverage: Record<string, number> = { missingEventDates: 0, conflictingDates: 0, unknownCampusEvents: 0, currentCampusFallbackEvents: 0, missingRegistrationDates: 0, excludedMessagingRecords: 0, legacySubmissionsSeparate: 0, unversionedSubmissions: 0, invalidScoreSubmissions: 0, submittingStudentsWithoutScores: 0, earlierValidFallbacks: 0, invalidGradedScoreRecords: 0, earlierValidGradedScoreFallbacks: 0 };
  const attemptDataQuality = { invalidRecords: 0, duplicateLogicalAttempts: 0, missingRequiredFields: 0, invalidStatuses: 0, invalidTimestamps: 0, invalidAttemptNumbers: 0, identityMismatches: 0 };
  const users = new Map(input.users.map(u => [u.id, u]));
  const definitions = new Map(input.definitions.map(d => [d.id, d]));
  const conversations = new Map(input.conversations.map(c => [c.id, c]));
  const links = new Map(input.links.map(l => [l.id, l]));
  const campusLabels = new Map(input.campuses.map(c => [typeof c.key === 'string' && c.key ? c.key : c.id, typeof c.label === 'string' && c.label ? c.label : c.id]));
  const campusOf = (record: Data, student: Data) => typeof record.campus === 'string' && record.campus ? record.campus : typeof student.campus === 'string' && student.campus ? student.campus : UNKNOWN;
  for (const u of users.values()) if (u.role === 'student') { const key = campusOf(u, u); if (!campusLabels.has(key)) campusLabels.set(key, key); }
  for (const request of input.appointments) {
    if (typeof request.campus === 'string' && request.campus.trim() && !campusLabels.has(request.campus)) campusLabels.set(request.campus, request.campus);
  }
  campusLabels.set(UNKNOWN, 'Unknown / Unassigned');
  const eventDate = (record: Data, canonical = 'createdAt', legacy = 'created_at', fallback?: string) => {
    const a = timestamp(record[canonical]), b = timestamp(record[legacy]);
    if (a !== null && b !== null && a !== b) coverage.conflictingDates++;
    const time = a ?? b ?? (fallback ? timestamp(record[fallback]) : null);
    if (time === null) coverage.missingEventDates++;
    return time;
  };
  type Event = { student: string; campus: string; kind: 'appointment' | 'message' | 'submission' | 'start'; time: number; id: string; definition: string; completed: boolean; status?: string; attemptNumber?: number };
  const events: Event[] = [];
  const add = (record: Data, kind: Event['kind'], time: number | null, studentId = record.studentId) => {
    const student = users.get(studentId);
    if (!student || student.role !== 'student' || time === null || time < start || time >= observedEnd) return;
    const campus = campusOf(record, student);
    if (!campusLabels.has(campus)) campusLabels.set(campus, campus);
    if (campus === UNKNOWN) coverage.unknownCampusEvents++;
    if (!record.campus) coverage.currentCampusFallbackEvents++;
    const submission = timestamp(record.submittedAt) ?? timestamp(record.submitted_at) ?? Infinity;
    events.push({ student: studentId, campus, kind, time, id: record.id, definition: record.assessmentId || '', completed: ['submitted', 'graded'].includes(record.status) && submission >= time && submission < observedEnd, status: record.status, attemptNumber: record.attemptNumber });
  };
  for (const appointment of input.appointments) add(appointment, 'appointment', eventDate(appointment));
  for (const message of input.messages) {
    const student = users.get(message.senderId), conversation = conversations.get(message.conversationId);
    const participants = conversation?.participantIds;
    const fac = Array.isArray(participants) && participants.length === 2 && new Set(participants).size === 2 ? participants.find((id: string) => id !== message.senderId) : undefined;
    const link = links.get(`${fac}_${message.senderId}`);
    const sent = eventDate(message);
    const linkedAt = timestamp(link?.respondedAt) ?? timestamp(link?.requestedAt);
    if (student?.role !== 'student' || !Array.isArray(participants) || !participants.includes(message.senderId) || users.get(fac)?.role !== 'facilitator' ||
      link?.status !== 'accepted' || link.studentId !== message.senderId || link.facilitatorId !== fac || linkedAt === null || sent === null || linkedAt > sent || message.type === 'system' || message.status === 'failed' || message.status === 'sending' || message.isDeleted === true) {
      coverage.excludedMessagingRecords++; continue;
    }
    add(message, 'message', sent, message.senderId);
  }
  const validatedAttempts = input.attempts.map(attempt => ({ attempt, validation: validateAssessmentAttempt(attempt) }));
  const logicalCounts = new Map<string, number>();
  for (const { validation } of validatedAttempts) if (validation.logicalKey) logicalCounts.set(validation.logicalKey, (logicalCounts.get(validation.logicalKey) ?? 0) + 1);
  const duplicateKeys = new Set([...logicalCounts].filter(([, count]) => count > 1).map(([key]) => key));
  attemptDataQuality.duplicateLogicalAttempts = [...duplicateKeys].reduce((sum, key) => sum + (logicalCounts.get(key)! - 1), 0);
  const submitted: Data[] = [];
  for (const { attempt, validation } of validatedAttempts) {
    for (const issue of validation.issues) {
      if (issue === 'missing_required_fields') attemptDataQuality.missingRequiredFields++;
      if (issue === 'invalid_status') attemptDataQuality.invalidStatuses++;
      if (issue === 'invalid_timestamp') attemptDataQuality.invalidTimestamps++;
      if (issue === 'invalid_attempt_number') attemptDataQuality.invalidAttemptNumbers++;
      if (issue === 'identity_mismatch') attemptDataQuality.identityMismatches++;
    }
    if (!validation.valid || (validation.logicalKey && duplicateKeys.has(validation.logicalKey))) {
      attemptDataQuality.invalidRecords++;
      continue;
    }
    if (filters.assessmentId && attempt.assessmentId !== filters.assessmentId) continue;
    add(attempt, 'start', validation.startedAt);
    if (!['submitted', 'graded'].includes(attempt.status)) continue;
    const time = validation.submittedAt;
    add(attempt, 'submission', time);
    if (time !== null && time >= start && time < observedEnd && users.get(attempt.studentId)?.role === 'student') submitted.push({ ...attempt, time });
  }
  // The old template model has no reliable cross-model identity; disclose it separately.
  for (const instance of input.legacyInstances) {
    const time = timestamp(instance.submittedAt);
    if (instance.status === 'submitted' && time !== null && time >= start && time < observedEnd && users.get(instance.studentId)?.role === 'student' && (!filters.campus || campusOf(instance, users.get(instance.studentId)!) === filters.campus) && !filters.assessmentId) coverage.legacySubmissionsSeparate++;
  }
  const cohort = [...users.values()].filter(u => u.role === 'student' && (timestamp(u.createdAt) ?? timestamp(u.created_at) ?? Infinity) < observedEnd);
  coverage.missingRegistrationDates = [...users.values()].filter(u => u.role === 'student' && timestamp(u.createdAt) === null && timestamp(u.created_at) === null && (!filters.campus || campusOf(u, u) === filters.campus)).length;
  const scoped = (campus: string) => events.filter(e => !campus || e.campus === campus);
  function summary(campus: string) {
    const list = scoped(campus), ids = (kind?: Event['kind']) => new Set(list.filter(e => kind ? e.kind === kind : e.kind !== 'start').map(e => e.student));
    const participants = ids(), denominator = cohort.filter(u => !campus || campusOf(u, u) === campus);
    const starterPairs = new Set(list.filter(e => e.kind === 'start' && e.definition).map(e => `${e.student}\u0000${e.definition}`));
    const completedPairs = new Set(list.filter(e => e.kind === 'start' && e.definition && e.completed).map(e => `${e.student}\u0000${e.definition}`));
    const unsupported = [...participants].some(id => !denominator.some(u => u.id === id));
    const missing = [...users.values()].some(u => u.role === 'student' && (!campus || campusOf(u, u) === campus) && timestamp(u.createdAt) === null && timestamp(u.created_at) === null);
    const attemptEvents = list.filter(e => e.kind === 'start');
    return { participants: participants.size, appointmentStudents: ids('appointment').size, messagingStudents: ids('message').size,
      assessmentStudents: ids('submission').size, appointmentRequests: list.filter(e => e.kind === 'appointment').length,
      attempts: list.filter(e => e.kind === 'start').length,
      submissions: list.filter(e => e.kind === 'submission').length, registered: denominator.length,
      participationRate: denominator.length && !unsupported && !missing ? participants.size / denominator.length * 100 : null,
      starters: starterPairs.size, completedStarters: completedPairs.size, incompleteStarters: starterPairs.size - completedPairs.size,
      completionRate: starterPairs.size ? completedPairs.size / starterPairs.size * 100 : null,
      inProgress: attemptEvents.filter(e => e.status === 'in_progress').length,
      retakes: attemptEvents.filter(e => (e.attemptNumber ?? 1) > 1).length,
      submissionRate: attemptEvents.length ? list.filter(e => e.kind === 'submission').length / attemptEvents.length * 100 : null,
      averageAttemptsPerStudent: starterPairs.size ? attemptEvents.length / starterPairs.size : null };
  }
  const scopedAccounts = (role: string) => [...users.values()].filter(user => user.role === role && (!filters.campus || campusOf(user, user) === filters.campus));
  const studentAccounts = scopedAccounts('student'), facilitatorAccounts = scopedAccounts('facilitator');
  const activeAccountCount = (rows: Data[]) => rows.every(user => typeof user.isActive === 'boolean') ? rows.filter(user => user.isActive === true).length : null;
  const acceptedPairs = new Map<string, string>();
  for (const link of input.links) {
    const student = users.get(link.studentId), facilitator = users.get(link.facilitatorId);
    if (link.status !== 'accepted' || student?.role !== 'student' || facilitator?.role !== 'facilitator' ||
      filters.campus && campusOf({ id: link.id }, student) !== filters.campus) continue;
    acceptedPairs.set(JSON.stringify([link.facilitatorId, link.studentId]), link.facilitatorId);
  }
  const facilitatorsWithRequests = new Set<string>();
  for (const request of input.appointments) {
    const student = users.get(request.studentId), facilitator = users.get(request.facilitatorId);
    const created = timestamp(request.createdAt) ?? timestamp(request.created_at);
    if (student?.role !== 'student' || facilitator?.role !== 'facilitator' || created === null || created < start || created >= observedEnd ||
      filters.campus && campusOf(request, student) !== filters.campus) continue;
    facilitatorsWithRequests.add(request.facilitatorId);
  }
  const acceptedFacilitators = new Set(acceptedPairs.values());
  const accountActivity = {
    studentAccounts: studentAccounts.length,
    activeStudentAccounts: activeAccountCount(studentAccounts),
    studentsWithUnknownActiveStatus: studentAccounts.filter(user => typeof user.isActive !== 'boolean').length,
    facilitatorAccounts: facilitatorAccounts.length,
    activeFacilitatorAccounts: activeAccountCount(facilitatorAccounts),
    facilitatorsWithUnknownActiveStatus: facilitatorAccounts.filter(user => typeof user.isActive !== 'boolean').length,
    acceptedStudentLinks: acceptedPairs.size,
    facilitatorsWithAcceptedStudents: acceptedFacilitators.size,
    facilitatorsWithRequests: facilitatorsWithRequests.size,
  };
  const selected = scoped(filters.campus);
  const trends = [];
  for (let bucket = bucketStart(start, filters.interval); bucket < observedEnd; bucket = nextBucket(bucket, filters.interval)) {
    const next = nextBucket(bucket, filters.interval), list = selected.filter(e => e.time >= bucket && e.time < next);
    const activity = list.filter(e => e.kind !== 'start');
    const unique = (kind?: Event['kind']) => new Set(list.filter(e => !kind || e.kind === kind).map(e => e.student)).size;
    trends.push({ label: filters.interval === 'monthly' ? localDate(bucket).slice(0, 7) : localDate(bucket), startDate: localDate(Math.max(start, bucket)), endDate: localDate(Math.min(end, next, observedEnd) - 1), partial: bucket < start || next > observedEnd, participants: new Set(activity.map(e => e.student)).size, appointmentRequests: activity.filter(e => e.kind === 'appointment').length, messagingStudents: new Set(activity.filter(e => e.kind === 'message').map(e => e.student)).size, attempts: list.filter(e => e.kind === 'start').length, submissions: activity.filter(e => e.kind === 'submission').length, assessmentStudents: new Set(activity.filter(e => e.kind === 'submission').map(e => e.student)).size, retakes: list.filter(e => e.kind === 'start' && (e.attemptNumber ?? 1) > 1).length });
  }
  // Latest valid attempt per student/instrument/version globally, before campus filtering.
  const latest = new Map<string, { student: string; score: number; campus: string; time: number; id: string; instrument: string; version: string; max: number }>();
  const newest = new Map<string, { time: number; id: string }>();
  const hasScore = new Set<string>();
  for (const attempt of submitted) {
    const definition = definitions.get(attempt.assessmentId), student = users.get(attempt.studentId)!;
    const version = definition?.analyticsScoringVersion === 'standard-v1' ? 'standard-v1' : `unversioned:${attempt.assessmentId}`;
    const matchesCampus = !filters.campus || campusOf(attempt, student) === filters.campus;
    if (definition?.analyticsScoringVersion !== 'standard-v1' && matchesCampus) coverage.unversionedSubmissions++;
    let valid = false;
    for (const scale of SCALES) {
      const key = JSON.stringify([attempt.studentId, scale.key, version]);
      const newestAttempt = newest.get(key);
      if (!newestAttempt || attempt.time > newestAttempt.time || attempt.time === newestAttempt.time && attempt.id.localeCompare(newestAttempt.id) > 0) newest.set(key, { time: attempt.time, id: attempt.id });
      const score = validatedScore(attempt, definition, scale);
      if (score === null) continue;
      valid = true;
      const prior = latest.get(key);
      if (!prior || attempt.time > prior.time || attempt.time === prior.time && attempt.id.localeCompare(prior.id) > 0) latest.set(key, { student: attempt.studentId, score, campus: campusOf(attempt, student), time: attempt.time, id: attempt.id, instrument: scale.key, version, max: scale.max });
    }
    if (!valid && matchesCampus) coverage.invalidScoreSubmissions++;
  }
  const groups = new Map<string, { campus: string; instrument: string; version: string; max: number; values: number[] }>();
  for (const [key, chosen] of latest) {
    if (filters.campus && chosen.campus !== filters.campus) continue;
    hasScore.add(chosen.student);
    const newestAttempt = newest.get(key)!;
    if (chosen.time < newestAttempt.time || chosen.time === newestAttempt.time && chosen.id.localeCompare(newestAttempt.id) < 0) coverage.earlierValidFallbacks++;
    const groupKey = JSON.stringify([chosen.campus, chosen.instrument, chosen.version]);
    const group = groups.get(groupKey) ?? { campus: chosen.campus, instrument: chosen.instrument, version: chosen.version, max: chosen.max, values: [] };
    group.values.push(chosen.score); groups.set(groupKey, group);
  }
  const submittingStudents = new Set(submitted.filter(a => !filters.campus || campusOf(a, users.get(a.studentId)!) === filters.campus).map(a => a.studentId));
  coverage.submittingStudentsWithoutScores = [...submittingStudents].filter(id => !hasScore.has(id)).length;
  const scores = [...groups.values()].map(group => {
    const values = group.values.sort((a, b) => a - b), suppressed = values.length < MIN_SCORE_GROUP;
    const bins = Array.from({ length: Math.ceil((group.max + 1) / 5) }, (_, i) => {
      const low = i * 5, high = Math.min(low + 4, group.max);
      return { label: `${low}-${high}`, count: values.filter(v => v >= low && v <= high).length as number | null };
    });
    // Hide ALL bins if any nonzero bin is small. Total subtraction cannot recover a hidden bin.
    const hideBins = suppressed || bins.some(b => b.count! > 0 && b.count! < MIN_SCORE_GROUP);
    return { campus: group.campus, label: campusLabels.get(group.campus)!, instrument: group.instrument, version: group.version, max: group.max,
      suppressed, sample: suppressed ? null : values.length, median: suppressed ? null : quantile(values, .5), q1: suppressed ? null : quantile(values, .25), q3: suppressed ? null : quantile(values, .75), mean: suppressed ? null : values.reduce((a, b) => a + b, 0) / values.length,
      bins: bins.map(b => ({ ...b, count: hideBins ? null : b.count })) };
  }).sort((a, b) => a.label.localeCompare(b.label) || a.instrument.localeCompare(b.instrument) || a.version.localeCompare(b.version));
  const newestGradedScores = new Map<string, { time: number; id: string }>();
  const latestValidGradedScores = new Map<string, { student: string; assessmentId: string; score: number; campus: string; time: number; id: string }>();
  for (const attempt of submitted) {
    if (attempt.status !== 'graded') continue;
    const student = users.get(attempt.studentId)!;
    const campus = campusOf(attempt, student);
    const matchesCampus = !filters.campus || campus === filters.campus;
    const key = JSON.stringify([attempt.studentId, attempt.assessmentId]);
    const newest = newestGradedScores.get(key);
    if (!newest || attempt.time > newest.time || attempt.time === newest.time && attempt.id.localeCompare(newest.id) > 0)
      newestGradedScores.set(key, { time: attempt.time, id: attempt.id });
    const definition = definitions.get(attempt.assessmentId);
    if (!definition || typeof attempt.score !== 'number' || !Number.isFinite(attempt.score) || attempt.score < 0 || attempt.score > 100) {
      if (matchesCampus) coverage.invalidGradedScoreRecords++;
      continue;
    }
    const prior = latestValidGradedScores.get(key);
    if (!prior || attempt.time > prior.time || attempt.time === prior.time && attempt.id.localeCompare(prior.id) > 0)
      latestValidGradedScores.set(key, { student: attempt.studentId, assessmentId: attempt.assessmentId, score: attempt.score, campus, time: attempt.time, id: attempt.id });
  }
  const gradedGroups = new Map<string, { title: string; values: number[] }>();
  for (const [key, chosen] of latestValidGradedScores) {
    if (filters.campus && chosen.campus !== filters.campus) continue;
    const newest = newestGradedScores.get(key)!;
    if (chosen.time < newest.time || chosen.time === newest.time && chosen.id.localeCompare(newest.id) < 0) coverage.earlierValidGradedScoreFallbacks++;
    const definition = definitions.get(chosen.assessmentId)!;
    const group = gradedGroups.get(chosen.assessmentId) ?? { title: typeof definition.title === 'string' ? definition.title : 'Untitled assessment', values: [] };
    group.values.push(chosen.score);
    gradedGroups.set(chosen.assessmentId, group);
  }
  const gradedScores = [...gradedGroups].map(([assessmentId, group]) => {
    const values = group.values.sort((a, b) => a - b), suppressed = values.length < MIN_SCORE_GROUP;
    const labels = Array.from({ length: 10 }, (_, index) => index === 9 ? '90-100' : String(index * 10) + '-' + String(index * 10 + 9));
    const bins = labels.map((label, index) => ({ label, count: values.filter(value => Math.min(9, Math.floor(value / 10)) === index).length }));
    const hideBins = suppressed || bins.some(bin => bin.count > 0 && bin.count < MIN_SCORE_GROUP);
    return { assessmentId, title: group.title, suppressed, sample: suppressed ? null : values.length,
      mean: suppressed ? null : values.reduce((sum, value) => sum + value, 0) / values.length,
      median: suppressed ? null : quantile(values, .5),
      bins: bins.map(bin => ({ label: bin.label, count: hideBins ? null : bin.count })) };
  }).sort((a, b) => a.title.localeCompare(b.title));
  const assessmentCohorts = input.definitions.filter(d => !filters.assessmentId || d.id === filters.assessmentId).map(definition => {
    const starts = selected.filter(e => e.kind === 'start' && e.definition === definition.id);
    const submissions = selected.filter(e => e.kind === 'submission' && e.definition === definition.id);
    const starters = new Set(starts.map(e => e.student)), completed = new Set(starts.filter(e => e.completed).map(e => e.student));
    return { assessmentId: definition.id, title: typeof definition.title === 'string' ? definition.title : 'Untitled assessment', attempts: starts.length, submissions: submissions.length, participatingStudents: starters.size, starters: starters.size, completed: completed.size, remaining: starters.size - completed.size, rate: starters.size ? completed.size / starters.size * 100 : null, submissionRate: starts.length ? submissions.length / starts.length * 100 : null, inProgress: starts.filter(event => event.status === 'in_progress').length, retakes: starts.filter(event => (event.attemptNumber ?? 1) > 1).length };
  }).filter(row => row.starters > 0).sort((a, b) => a.title.localeCompare(b.title));
  return { generatedAt: now.toISOString(), filters, referrals: referralStatistics(input, filters, now), campuses: [...campusLabels].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label)),
    assessments: input.definitions.map(d => ({ id: d.id, title: typeof d.title === 'string' ? d.title : 'Untitled assessment' })).sort((a, b) => a.title.localeCompare(b.title)),
    totals: summary(filters.campus), accountActivity, gradedScores, participation: [...campusLabels].filter(([key]) => !filters.campus || key === filters.campus).map(([campus, label]) => ({ campus, label, ...summary(campus) })), assessmentCohorts, trends, scores, coverage,
    attemptDataQuality,
    notes: ['Participation uses registered portal students, including currently inactive accounts, not college enrollment. Rates use current campus attribution; historical membership is unavailable.',
      'Assessment filters affect only assessment activity. Start-cohort completion counts distinct students who started and completed at least one matching attempt by period end.',
      'Messaging counts student-sent messages in currently accepted two-person facilitator relationships with a link date before the message. Revoked relationships are excluded; historical authorization is incomplete.',
      'Legacy template submissions are reported separately and excluded from combined totals because cross-model deduplication is unavailable.',
      'Scores use the latest valid submission per student, instrument and version. Unversioned results use the current definition and stay separate by definition; historical comparability is unverified.',
      'DASS-21 subscale sums are doubled (0-42). Numeric scores describe responses and do not diagnose, prescribe treatment or rank campus wellbeing.',
      'Score groups require at least 5 students. All histogram bins are hidden if any nonzero bin has fewer than 5 students. Filters and participation counts still limit anonymity.'] };
}
