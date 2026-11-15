import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardModules } from './helpers/dashboardModules.mjs';
const metrics = dashboardModules().load('lib/dashboardMetrics.ts');
const student = { uid: 'student', role: 'student' }, facilitator = { uid: 'facilitator', role: 'facilitator' }, admin = { uid: 'admin', role: 'super_admin' };
const appointment = (changes = {}) => ({ studentId: 'student', facilitatorId: 'facilitator', status: 'accepted', scheduledAt: new Date('2026-11-08T16:30:00Z'), durationMinutes: 60, ...changes });
test('appointment counts retain unknown statuses and exclude unrelated subjects', () => {
  const rows = [appointment(), appointment({ status: 'completed' }), appointment({ studentId: 'other', facilitatorId: 'other' }), appointment({ status: 'unknown-state' })];
  const result = metrics.appointmentStatusCounts(student, rows);
  assert.equal(result.accepted, 1); assert.equal(result.completed, 1); assert.equal(result.unknown, 1);
  assert.equal(metrics.appointmentStatusCounts(facilitator, rows).accepted, 1);
});
test('day/week/month trends use Manila boundaries with explicit invalid-date counts', () => {
  const rows = [appointment(), appointment({ scheduledAt: '2026-11-08T15:30:00Z' }), appointment({ scheduledAt: null })];
  assert.deepEqual(metrics.appointmentTrends(student, rows), { periods: [{ period: '2026-11-08', count: 1 }, { period: '2026-11-09', count: 1 }], unknownDate: 1 });
  assert.deepEqual(metrics.appointmentTrends(student, rows, 'week').periods, [{ period: '2026-11-02', count: 1 }, { period: '2026-11-09', count: 1 }]);
  assert.deepEqual(metrics.appointmentTrends(student, rows, 'month').periods, [{ period: '2026-11', count: 2 }]);
});
test('workload counts appointment minutes without inventing capacity or permitting student enumeration', () => {
  const rows = [appointment(), appointment({ durationMinutes: undefined }), appointment({ status: 'cancelled' }), appointment({ facilitatorId: 'other' })];
  assert.equal(metrics.facilitatorWorkload(student, rows), null);
  assert.deepEqual(metrics.facilitatorWorkload(facilitator, rows), [{ facilitatorId: 'facilitator', appointments: 2, scheduledMinutes: 60, unknownDuration: 1 }]);
});
test('accepted relationships are deduplicated by exact participant pair', () => {
  const accepted = { studentId: 'student', facilitatorId: 'facilitator', status: 'accepted' };
  assert.equal(metrics.acceptedRelationshipCount(student, [accepted, accepted, { ...accepted, status: 'pending' }, { ...accepted, studentId: 'other' }]), 1);
});
test('assessment participation requires explicit permitted student scope for facilitator queries', () => {
  const rows = [{ studentId: 'student', assessmentId: 'one', status: 'submitted' }, { studentId: 'other', assessmentId: 'one', status: 'in_progress' }];
  assert.deepEqual(metrics.assessmentParticipation(facilitator, rows), { students: 0, submitted: 0, inProgress: 0, assessments: 0 });
  assert.deepEqual(metrics.assessmentParticipation(facilitator, rows, ['student']), { students: 1, submitted: 1, inProgress: 0, assessments: 1 });
  assert.equal(metrics.assessmentParticipation(student, rows).students, 1);
});
test('facilitator assessment comparisons deduplicate published definitions and exclude unlinked students', () => {
  const result = metrics.facilitatorAssessmentParticipation(['s1', 's2', 's3'], ['phq', 'gad'], [
    { studentId: 's1', assessmentId: 'phq', status: 'submitted' },
    { studentId: 's1', assessmentId: 'phq', status: 'graded' },
    { studentId: 's1', assessmentId: 'retired', status: 'submitted' },
    { studentId: 's1', assessmentId: 'gad', status: 'in_progress' },
    { studentId: 's2', assessmentId: 'phq', status: 'graded' },
    { studentId: 'unlinked', assessmentId: 'gad', status: 'submitted' },
  ]);
  assert.deepEqual(result, {
    submittedAttempts: 4,
    studentsWithSubmissions: 2,
    students: [
      { studentId: 's1', completedAssessments: 1, submittedAttempts: 3 },
      { studentId: 's2', completedAssessments: 1, submittedAttempts: 1 },
      { studentId: 's3', completedAssessments: 0, submittedAttempts: 0 },
    ],
  });
});
test('student assessment progress uses exclusive published-catalog states and six Manila-month submission buckets', () => {
  const result = metrics.studentAssessmentProgress(
    [{ id: 'phq', title: 'PHQ-9' }, { id: 'gad', title: 'GAD-7' }, { id: 'dass', title: 'DASS-21' }, { id: 'empty', title: 'No attempts' }],
    [
      { assessmentId: 'phq', status: 'submitted', submittedAt: new Date('2026-10-05T04:00:00Z'), score: 70 },
      { assessmentId: 'phq', status: 'graded', submittedAt: new Date('2026-11-04T04:00:00Z'), score: 80 },
      { assessmentId: 'removed-from-catalog', status: 'submitted', submittedAt: new Date('2026-11-05T04:00:00Z') },
    ],
    ['phq', 'dass'],
    new Date('2026-11-15T04:00:00Z'),
  );
  assert.equal(result.total, 4);
  assert.equal(result.completed, 1);
  assert.equal(result.inProgress, 2);
  assert.equal(result.notStarted, 2);
  assert.deepEqual(result.progressDistribution, { completed: 0, inProgress: 1, activeRetakes: 1, notStarted: 2 });
  assert.equal(result.submittedAttempts, 3);
  assert.deepEqual(result.progressTrend.map(row => row.period), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(result.progressTrend.map(row => row.count), [0, 0, 0, 0, 1, 2]);
  assert.deepEqual(result.scores, [{ assessmentId: 'phq', title: 'PHQ-9', latest: 80, average: 80, submissions: 1 }]);
});
test('student assessment analytics handles an empty published catalog and rejects invalid scores', () => {
  const result = metrics.studentAssessmentProgress([], [
    { assessmentId: 'unknown', status: 'submitted', score: 110 },
  ], [], new Date('2026-11-15T04:00:00Z'));
  assert.equal(result.total, 0);
  assert.equal(result.completed, 0);
  assert.equal(result.inProgress, 0);
  assert.equal(result.notStarted, 0);
  assert.deepEqual(result.scores, []);
});
test('severity summaries count existing authorized indicators and preserve unknowns', () => {
  const rows = [{ facilitatorId: 'facilitator', severity: 'critical' }, { facilitatorId: 'other', severity: 'high' }, { facilitatorId: 'facilitator', severity: 'not-classified' }];
  assert.equal(metrics.screeningSeverityCounts(student, rows), null);
  assert.deepEqual(metrics.screeningSeverityCounts(facilitator, rows), { high: 1, medium: 0, low: 0, unknown: 1 });
  assert.deepEqual(metrics.screeningSeverityCounts(admin, []), { high: 0, medium: 0, low: 0, unknown: 0 });
});
