import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditHistory } from './audit-referral-history.mjs';

test('Manila boundaries, absent weeks, incomplete weeks, and future records', () => {
  const report = auditHistory([
    { createdAt: '2026-10-04T16:00:00Z', status: 'requested' },
    { createdAt: '2026-10-18T15:59:59Z', status: 'accepted' },
    { createdAt: '2026-10-27T16:00:00Z', status: 'requested' },
  ], '2026-10-27');
  assert.equal(report.firstRequestDate, '2026-10-05');
  assert.equal(report.lastRequestDate, '2026-10-18');
  assert.deepEqual(report.weekly.map(w => w.requests), [1, 1, 0, 0]);
  assert.equal(report.weekly.at(-1).completeCalendarWeek, false);
  assert.equal(report.completeCalendarWeeksAfterFirstObservedWeek, 2);
  assert.equal(report.quality.futureCreationDates, 1);
});

test('missing, malformed, conflicting and legacy dates are explicit', () => {
  const report = auditHistory([{}, { createdAt: 'invalid' },
    { created_at: '2026-10-02' },
    { createdAt: '2026-10-03', created_at: '2026-10-04', acceptedAt: '2026-10-02' },
  ], '2026-10-27');
  assert.equal(report.quality.missingCreationDates, 1);
  assert.equal(report.quality.invalidCreationDates, 1);
  assert.equal(report.quality.legacyDateFallbacks, 1);
  assert.equal(report.quality.conflictingCreationDates, 1);
  assert.equal(report.quality.invalidAcceptanceDates, 1);
  assert.equal(report.datedRequestsThroughAsOf, 2);
  assert.throws(() => auditHistory([], '2026-02-30'));
});

test('empty history does not invent observations or leak free text', () => {
  assert.deepEqual(auditHistory([], '2026-10-27').weekly, []);
  const output = auditHistory([{ createdAt: new Date('2026-10-05'), studentId: 'PRIVATE', notes: 'CONFIDENTIAL',
    acceptedAt: { toMillis: () => Date.parse('2026-10-06') }, status: 'accepted' }], '2026-10-27');
  assert.equal(output.quality.validAcceptanceDurations, 1);
  assert.equal(JSON.stringify(output).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(output).includes('CONFIDENTIAL'), false);
});
