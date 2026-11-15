import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatistics, STATISTICS_FIELDS } from '../../../firebase/functions/test/helpers/statisticsModules.mjs';

const filters = { startDate: '2026-10-01', endDate: '2026-10-31', campus: '', assessmentId: '', interval: 'monthly' };
const now = new Date('2026-11-02T00:00:00Z');
const ts = day => '2026-10-' + String(day).padStart(2, '0') + 'T12:00:00+08:00';
const base = () => ({
  users: [],
  campuses: [{ id: 'lipa', key: 'lipa', label: 'Lipa' }, { id: 'alangilan', key: 'alangilan', label: 'Alangilan' }],
  appointments: [], messages: [], conversations: [], links: [], attempts: [],
  definitions: [], legacyInstances: [],
});
const student = (id, campus = 'lipa', isActive = true) => ({ id, role: 'student', campus, isActive, createdAt: '2026-01-01T00:00:00Z' });
const facilitator = (id, campus = 'lipa', isActive = true) => ({ id, role: 'facilitator', campus, isActive, createdAt: '2026-01-01T00:00:00Z' });
const attempt = (studentId, score, attemptNumber = 1, day = 5, status = 'graded', assessmentId = 'quiz') => ({
  id: assessmentId + '_' + studentId + '_' + attemptNumber,
  studentId, assessmentId, attemptNumber, campus: 'lipa', status,
  startedAt: ts(Math.max(1, day - 1)), submittedAt: ts(day), score,
});
const report = (input, changes = {}) => buildStatistics(input, { ...filters, ...changes }, now);

test('Admin data source includes only the additional fields needed for account and graded-score summaries', () => {
  assert.ok(STATISTICS_FIELDS.users.includes('isActive'));
  assert.ok(STATISTICS_FIELDS.appointments.includes('facilitatorId'));
  assert.ok(STATISTICS_FIELDS.assessment_attempts.includes('score'));
});

test('account activity counts role-valid accounts, current accepted links, and period request recipients', () => {
  const input = base();
  input.users = [
    student('s1', 'lipa', true), student('s2', 'alangilan', false),
    facilitator('f1', 'lipa', true), facilitator('f2', 'alangilan', false),
  ];
  input.links = [
    { id: 'f1_s1', facilitatorId: 'f1', studentId: 's1', status: 'accepted' },
    { id: 'f1_s2', facilitatorId: 'f1', studentId: 's2', status: 'accepted' },
    { id: 'f2_s2', facilitatorId: 'f2', studentId: 's2', status: 'requested' },
  ];
  input.appointments = [
    { id: 'r1', studentId: 's1', facilitatorId: 'f1', campus: 'lipa', status: 'requested', createdAt: ts(8) },
    { id: 'r2', studentId: 's2', facilitatorId: 'f2', campus: 'alangilan', status: 'rejected', createdAt: ts(9) },
    { id: 'outside-period', studentId: 's2', facilitatorId: 'f1', campus: 'lipa', status: 'accepted', createdAt: '2026-09-20T12:00:00+08:00' },
  ];
  assert.deepEqual(report(input).accountActivity, {
    studentAccounts: 2, activeStudentAccounts: 1, studentsWithUnknownActiveStatus: 0,
    facilitatorAccounts: 2, activeFacilitatorAccounts: 1, facilitatorsWithUnknownActiveStatus: 0,
    acceptedStudentLinks: 2, facilitatorsWithAcceptedStudents: 1, facilitatorsWithRequests: 2,
  });
  assert.deepEqual(report(input, { campus: 'lipa' }).accountActivity, {
    studentAccounts: 1, activeStudentAccounts: 1, studentsWithUnknownActiveStatus: 0,
    facilitatorAccounts: 1, activeFacilitatorAccounts: 1, facilitatorsWithUnknownActiveStatus: 0,
    acceptedStudentLinks: 1, facilitatorsWithAcceptedStudents: 1, facilitatorsWithRequests: 1,
  });
});

test('active account totals are unavailable when the selected role has missing isActive fields', () => {
  const input = base();
  input.users = [student('s1'), { id: 's2', role: 'student', campus: 'lipa' }, facilitator('f1')];
  const accounts = report(input).accountActivity;
  assert.equal(accounts.activeStudentAccounts, null);
  assert.equal(accounts.studentsWithUnknownActiveStatus, 1);
  assert.equal(accounts.activeFacilitatorAccounts, 1);
});

test('graded score distributions use the latest valid grade per student and suppress sparse score bands', () => {
  const input = base();
  input.definitions = [{ id: 'quiz', title: 'Biology Quiz' }];
  input.users = Array.from({ length: 7 }, (_, index) => student('s' + index));
  input.attempts = [
    attempt('s0', 40, 1, 3), attempt('s0', 90, 2, 10),
    attempt('s1', 80), attempt('s2', 80), attempt('s3', 80),
    attempt('s4', 80), attempt('s5', 100),
    attempt('s6', 105),
    attempt('s6', 99, 2, 11, 'submitted'),
  ];
  const graded = report(input).gradedScores[0];
  assert.equal(graded.title, 'Biology Quiz');
  assert.equal(graded.suppressed, false);
  assert.equal(graded.sample, 6);
  assert.equal(graded.mean, 85);
  assert.equal(graded.median, 80);
  assert.ok(graded.bins.every(bin => bin.count === null), 'all score bands are hidden when nonzero bins are smaller than five');
  assert.equal(report(input).coverage.invalidGradedScoreRecords, 1);
  assert.equal(report(input).coverage.earlierValidGradedScoreFallbacks, 0);
});

test('graded score bands render counts only when every nonzero band meets the privacy threshold', () => {
  const input = base();
  input.definitions = [{ id: 'quiz', title: 'Biology Quiz' }];
  input.users = Array.from({ length: 5 }, (_, index) => student('s' + index));
  input.attempts = Array.from({ length: 5 }, (_, index) => attempt('s' + index, 80 + index));
  const graded = report(input).gradedScores[0];
  assert.equal(graded.sample, 5);
  assert.equal(graded.suppressed, false);
  assert.equal(graded.bins.find(bin => bin.label === '80-89').count, 5);
  assert.equal(graded.bins.find(bin => bin.label === '90-100').count, 0);
});

test('an invalid latest graded percentage falls back to the latest earlier valid grade', () => {
  const input = base();
  input.definitions = [{ id: 'quiz', title: 'Biology Quiz' }];
  input.users = Array.from({ length: 5 }, (_, index) => student('s' + index));
  input.attempts = Array.from({ length: 5 }, (_, index) => attempt('s' + index, 80));
  input.attempts.push(attempt('s0', 120, 2, 11));
  const result = report(input);
  assert.equal(result.gradedScores[0].sample, 5);
  assert.equal(result.gradedScores[0].mean, 80);
  assert.equal(result.coverage.invalidGradedScoreRecords, 1);
  assert.equal(result.coverage.earlierValidGradedScoreFallbacks, 1);
});
