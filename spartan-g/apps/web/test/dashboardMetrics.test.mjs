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
test('severity summaries count existing authorized indicators and preserve unknowns', () => {
  const rows = [{ facilitatorId: 'facilitator', severity: 'critical' }, { facilitatorId: 'other', severity: 'high' }, { facilitatorId: 'facilitator', severity: 'not-classified' }];
  assert.equal(metrics.screeningSeverityCounts(student, rows), null);
  assert.deepEqual(metrics.screeningSeverityCounts(facilitator, rows), { high: 1, medium: 0, low: 0, unknown: 1 });
  assert.deepEqual(metrics.screeningSeverityCounts(admin, []), { high: 0, medium: 0, low: 0, unknown: 0 });
});
