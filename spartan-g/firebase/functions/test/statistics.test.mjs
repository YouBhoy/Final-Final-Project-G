import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatistics, validateFilters, dateBoundary, validatedScore, SCALES } from './helpers/statisticsModules.mjs';

const filters = { startDate: '2026-10-01', endDate: '2026-10-31', campus: '', assessmentId: '', interval: 'weekly' };
const now = new Date('2026-11-02T00:00:00Z');
const ts = day => `2026-10-${String(day).padStart(2, '0')}T12:00:00+08:00`;
const student = (id, campus = 'lipa') => ({ id, role: 'student', campus, createdAt: '2026-01-01T00:00:00Z' });
const definition = (id = 'standard', version = 'standard-v1') => ({ id, title: 'Student assessment', ...(version ? { analyticsScoringVersion: version } : {}), questions: [...new Set(SCALES.flatMap(scale => scale.ids))].map(id => ({ id, type: 'multiple_choice', options: ['0', '1', '2', '3'].map(id => ({ id, label: id })) })) });
const answers = (value = '1') => [...new Set(SCALES.flatMap(scale => scale.ids))].map(questionId => ({ questionId, value }));
const attempt = (id, studentId, day = 5, value = '1', assessmentId = 'standard') => ({ id, studentId, assessmentId, campus: 'lipa', status: 'submitted', startedAt: ts(day - 1), submittedAt: ts(day), answers: answers(value), overallRiskScore: 99999 });
const empty = () => ({ users: [], campuses: [{ id: 'lipa', key: 'lipa', label: 'Lipa' }, { id: 'alangilan', key: 'alangilan', label: 'Alangilan' }], definitions: [definition()], appointments: [], messages: [], conversations: [], links: [], attempts: [], legacyInstances: [] });
const report = (input, changes = {}) => buildStatistics(input, { ...filters, ...changes }, now);
function scoredInput(n = 5) { const data = empty(); for (let i = 0; i < n; i++) { data.users.push(student(`s${i}`)); data.attempts.push(attempt(`a${i}`, `s${i}`)); } return data; }

test('strict dates, leap dates, maximum window and Manila midnight', () => {
  assert.equal(dateBoundary('2026-10-01'), Date.parse('2026-09-30T16:00:00Z'));
  assert.throws(() => dateBoundary('2026-02-30'));
  assert.throws(() => dateBoundary('10/01/2026'));
  assert.doesNotThrow(() => dateBoundary('2024-02-29'));
  assert.throws(() => validateFilters({ ...filters, endDate: '2026-09-30' }));
  assert.throws(() => validateFilters({ ...filters, endDate: '2028-01-01' }));
  assert.throws(() => validateFilters({ ...filters, interval: 'daily' }));
});
test('unique participation is a union, while requests and retakes remain events', () => {
  const data = scoredInput(1);
  data.appointments.push({ id: 'r1', studentId: 's0', createdAt: ts(2) }, { id: 'r2', studentId: 's0', createdAt: ts(8) });
  data.attempts.push(attempt('retake', 's0', 9));
  const result = report(data);
  assert.equal(result.totals.participants, 1);
  assert.equal(result.totals.appointmentRequests, 2);
  assert.equal(result.totals.submissions, 2);
  assert.equal(result.totals.assessmentStudents, 1);
  assert.equal(result.totals.participationRate, 100);
  assert.ok(result.trends.reduce((sum, bucket) => sum + bucket.participants, 0) > result.totals.participants);
});
test('inclusive local end, exclusive next midnight, Monday weekly boundary', () => {
  const data = empty(); data.users = [student('s')];
  data.appointments = [
    { id: 'before', studentId: 's', createdAt: '2026-09-30T15:59:59Z' },
    { id: 'first', studentId: 's', createdAt: '2026-09-30T16:00:00Z' },
    { id: 'last', studentId: 's', createdAt: '2026-10-31T15:59:59Z' },
    { id: 'after', studentId: 's', createdAt: '2026-10-31T16:00:00Z' },
    { id: 'sun', studentId: 's', createdAt: '2026-10-04T15:59:59Z' },
    { id: 'mon', studentId: 's', createdAt: '2026-10-04T16:00:00Z' },
  ];
  const result = report(data);
  assert.equal(result.totals.appointmentRequests, 4);
  assert.equal(result.trends[0].label, '2026-09-28');
  assert.equal(result.trends[0].appointmentRequests, 2);
  assert.equal(result.trends[1].appointmentRequests, 1);
  assert.equal(result.trends[0].partial, true);
});
test('current period stops at generation time and visibly marks partial month', () => {
  const data = empty(); data.users = [student('s')];
  data.appointments = [{ id: 'now', studentId: 's', createdAt: ts(5) }, { id: 'future', studentId: 's', createdAt: ts(20) }];
  const result = buildStatistics(data, { ...filters, interval: 'monthly' }, new Date(ts(13)));
  assert.equal(result.totals.appointmentRequests, 1);
  assert.equal(result.trends[0].partial, true);
  assert.equal(result.trends[0].endDate, '2026-10-13');
});
test('unknown campus retained; missing/post-period registration makes rate unavailable', () => {
  const data = empty(); data.users = [student('s', undefined), { id: 'unknown', role: 'student' }, { ...student('late'), createdAt: '2026-11-01T00:00:00Z' }];
  data.appointments = [{ id: 'r', studentId: 'unknown', createdAt: ts(4) }, { id: 'r2', studentId: 'late', createdAt: ts(4) }];
  const result = report(data);
  assert.equal(result.totals.participationRate, null);
  assert.equal(result.participation.find(row => row.campus === '__unknown__').participants, 1);
  assert.equal(result.coverage.missingRegistrationDates, 1);
  assert.equal(result.coverage.unknownCampusEvents, 1);
});
test('campus transfer snapshots cannot generate a rate over 100 percent', () => {
  const data = empty(); data.users = [student('s', 'alangilan')];
  data.appointments = [{ id: 'r', studentId: 's', campus: 'lipa', createdAt: ts(4) }];
  assert.equal(report(data, { campus: 'lipa' }).totals.participationRate, null);
  assert.equal(report(data).totals.participationRate, 100);
});
test('messaging requires real eligible student sends, accepted canonical relationship and dates', () => {
  const data = empty(); data.users = [student('s'), { id: 'fac', role: 'facilitator' }];
  data.conversations = [{ id: 'c', participantIds: ['s', 'fac'] }];
  data.links = [{ id: 'fac_s', studentId: 's', facilitatorId: 'fac', status: 'accepted', respondedAt: ts(2) }];
  data.messages = [
    { id: 'm', senderId: 's', conversationId: 'c', createdAt: ts(3) },
    { id: 'm2', senderId: 'fac', conversationId: 'c', createdAt: ts(3) },
    { id: 'm3', senderId: 's', conversationId: 'c', createdAt: ts(3), isDeleted: true },
    { id: 'm4', senderId: 's', conversationId: 'c', createdAt: ts(3), type: 'system' },
    { id: 'm5', senderId: 's', conversationId: 'c', createdAt: ts(1) },
  ];
  assert.equal(report(data).totals.messagingStudents, 1);
  assert.equal(report(data).coverage.excludedMessagingRecords, 4);
  data.links[0].status = 'rejected';
  assert.equal(report(data).totals.messagingStudents, 0);
  data.links[0].status = 'accepted';
  data.conversations[0].participantIds = { malformed: true };
  assert.equal(report(data).totals.messagingStudents, 0, 'malformed participant metadata cannot crash or count');
});
test('assessment-only filter leaves appointment metrics intact', () => {
  const data = scoredInput(1); data.appointments = [{ id: 'r', studentId: 's0', createdAt: ts(4) }];
  assert.equal(report(data, { assessmentId: 'different' }).totals.appointmentRequests, 1);
  assert.equal(report(data, { assessmentId: 'different' }).totals.submissions, 0);
});
test('completion follows starts in the period, not all period submissions', () => {
  const data = scoredInput(2);
  data.attempts[0].startedAt = '2026-09-29T00:00:00Z';
  data.attempts[1].status = 'in_progress'; delete data.attempts[1].submittedAt;
  const result = report(data);
  assert.equal(result.totals.submissions, 1);
  assert.equal(result.assessmentCohorts[0].starters, 1);
  assert.equal(result.assessmentCohorts[0].completed, 0);
  assert.equal(result.assessmentCohorts[0].rate, 0);
});
test('missing, duplicate, extra, blank, decimal, out-of-range and unsupported options cannot become valid scores', () => {
  const original = attempt('a', 's'); const def = definition();
  for (const transform of [
    list => list.slice(1), list => [...list, list[0]], list => [...list, { questionId: 'invented', value: '0' }],
    list => list.map((a, i) => i ? a : { ...a, value: '' }),
    list => list.map((a, i) => i ? a : { ...a, value: '1.5' }),
    list => list.map((a, i) => i ? a : { ...a, value: '4' }),
    list => list.map((a, i) => i ? a : { ...a, value: 'NaN' }),
  ]) assert.equal(validatedScore({ ...original, answers: transform(original.answers) }, def, SCALES[0]), null);
  const invalidDefinition = structuredClone(def); invalidDefinition.questions[0].options[0].id = 'a';
  assert.equal(validatedScore(original, invalidDefinition, SCALES[0]), null);
});
test('scores recomputed, correct scale ranges and doubled DASS, independent instrument completeness', () => {
  const all = attempt('a', 's', 5, '3'), def = definition();
  assert.equal(validatedScore(all, def, SCALES[0]), 27);
  assert.equal(validatedScore(all, def, SCALES[1]), 21);
  assert.equal(validatedScore(all, def, SCALES[2]), 42);
  all.answers = all.answers.filter(a => a.questionId !== 'gad1');
  assert.equal(validatedScore(all, def, SCALES[0]), 27);
  assert.equal(validatedScore(all, def, SCALES[1]), null);
});
test('latest valid retake wins; a later invalid submission falls back and is disclosed', () => {
  const data = scoredInput();
  data.attempts.push(attempt('valid-retake', 's0', 9, '2'));
  data.attempts.push({ ...attempt('bad-retake', 's0', 12), answers: [] });
  const result = report(data), phq = result.scores.find(score => score.instrument === 'PHQ-9');
  assert.equal(phq.sample, 5);
  assert.equal(phq.mean, 10.8);
  assert.equal(result.coverage.earlierValidFallbacks, 5);
  assert.equal(result.coverage.invalidScoreSubmissions, 1);
});
test('tie breaking by document id is deterministic independent of input order', () => {
  const data = scoredInput(); data.attempts.push(attempt('z', 's0', 5, '3'));
  const first = report(data); data.attempts.reverse();
  assert.deepEqual(report(data).scores, first.scores);
});
test('compatible definitions deduplicate students; unversioned definitions remain separate', () => {
  const data = scoredInput(); data.definitions.push(definition('second'));
  data.attempts.push(...data.users.map(u => attempt(`b_${u.id}`, u.id, 9, '2', 'second')));
  assert.equal(report(data).scores.find(s => s.instrument === 'PHQ-9').sample, 5);
  delete data.definitions[1].analyticsScoringVersion;
  assert.equal(report(data).scores.filter(s => s.instrument === 'PHQ-9').length, 2);
});
test('latest selection happens before campus filtering, so transferred student is not counted twice', () => {
  const data = scoredInput();
  data.attempts.push({ ...attempt('new-campus', 's0', 9), campus: 'alangilan' });
  assert.equal(report(data, { campus: 'lipa' }).scores.find(s => s.instrument === 'PHQ-9').suppressed, true);
  assert.equal(report(data, { campus: 'alangilan' }).scores.find(s => s.instrument === 'PHQ-9').sample, null);
});
test('small groups return no exact size or statistics; any small nonzero bin hides all bins', () => {
  const small = report(scoredInput(4)).scores[0];
  assert.equal(small.suppressed, true);
  for (const key of ['sample', 'median', 'q1', 'q3', 'mean']) assert.equal(small[key], null);
  assert.ok(small.bins.every(bin => bin.count === null));
  const large = scoredInput(6); large.attempts[0].answers = answers('3');
  const result = report(large).scores.find(s => s.instrument === 'PHQ-9');
  assert.equal(result.sample, 6);
  assert.ok(result.bins.every(bin => bin.count === null));
  assert.ok(report(scoredInput(5)).scores[0].bins.every(bin => bin.count !== null));
});
test('canonical and legacy timestamps normalize, missing dates are disclosed', () => {
  const data = empty(); data.users = [student('s')];
  data.appointments = [{ id: 'legacy', studentId: 's', created_at: ts(4) }, { id: 'missing', studentId: 's' }, { id: 'conflict', studentId: 's', createdAt: ts(5), created_at: '2026-11-01T00:00:00Z' }];
  const result = report(data);
  assert.equal(result.totals.appointmentRequests, 2);
  assert.equal(result.coverage.missingEventDates, 1);
  assert.equal(result.coverage.conflictingDates, 1);
});
test('legacy instances stay separate; aggregate report contains no student ids, answers, emails or message bodies', () => {
  const data = scoredInput(5); data.users[0].email = 'private-student@example.com';
  data.legacyInstances = [{ id: 'old', studentId: 's0', status: 'submitted', submittedAt: ts(5) }];
  data.messages = [{ id: 'private-message', senderId: 's0', conversationId: 'unknown', createdAt: ts(6), body: 'SECRET MESSAGE' }];
  const result = report(data);
  assert.equal(result.coverage.legacySubmissionsSeparate, 1);
  assert.equal(result.totals.submissions, 5);
  const json = JSON.stringify(result);
  for (const privateValue of ['private-student@example.com', 'SECRET MESSAGE', 'private-message', '"s0"', '"answers"', 'overallRiskScore']) assert.ok(!json.includes(privateValue));
});
test('empty report has unavailable rates rather than division errors', () => {
  const result = report(empty());
  assert.equal(result.totals.participants, 0);
  assert.equal(result.totals.participationRate, null);
  assert.equal(result.totals.completionRate, null);
  assert.deepEqual(result.scores, []);
});
