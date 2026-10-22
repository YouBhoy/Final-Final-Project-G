import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatisticsLoader, STATISTICS_FIELDS, MAX_STATISTICS_RECORDS, buildStatistics, SCALES, pseudonymizeAuditRows } from './helpers/statisticsModules.mjs';

function fixture() {
  let uid = 'admin', active = true, role = 'super_admin', reads = 0, failure = false;
  const source = {
    currentUid: () => uid,
    user: async () => ({ role, isActive: active }),
    records: async name => { reads++; if (failure) throw new Error('offline'); return name === 'users' ? [{ id: 's', role: 'student', campus: 'lipa', createdAt: new Date('2026-01-01'), email: 'PRIVATE@example.com' }] : name === 'appointments' ? [{ id: 'a', studentId: 's', createdAt: new Date('2026-10-05'), notes: 'PRIVATE NOTES' }] : []; },
  };
  return { loader: createStatisticsLoader(source), source, reads: () => reads, account: value => { uid = value; }, active: value => { active = value; }, role: value => { role = value; }, fail: value => { failure = value; } };
}
test('browser data load requires an active admin before any collection read', async () => {
  const f = fixture();
  for (const role of ['student', 'facilitator']) { f.role(role); await assert.rejects(f.loader.input(), error => error.code === 'permission-denied'); }
  f.role('super_admin'); f.active(false); await assert.rejects(f.loader.input(), error => error.code === 'permission-denied');
  f.account(null); await assert.rejects(f.loader.input(), error => error.code === 'unauthenticated');
  assert.equal(f.reads(), 0);
});
test('filter/tab reuse shares a memory snapshot; refresh reloads every source', async () => {
  const f = fixture(), count = Object.keys(STATISTICS_FIELDS).length;
  const [a, b] = await Promise.all([f.loader.input(), f.loader.input()]);
  assert.equal(a, b); assert.equal(f.reads(), count);
  await f.loader.input(); assert.equal(f.reads(), count);
  await f.loader.input(true); assert.equal(f.reads(), count * 2);
});
test('cache does not retain names, emails, notes or message bodies, and report stays aggregate', async () => {
  const f = fixture(), baseRead = f.source.records;
  f.source.records = async name => name === 'assessment_attempts' ? [{ id: 'invalid', answers: [{ questionId: 'phq1', value: 'PRIVATE WRITTEN RESPONSE' }] }] : baseRead(name);
  const input = await f.loader.input();
  assert.ok(!JSON.stringify(input).includes('PRIVATE'));
  assert.equal(input.attempts[0].answers[0].value, null, 'written responses are not retained as zero scores');
  const report = buildStatistics(input, { startDate: '2026-10-01', endDate: '2026-10-31', campus: '', assessmentId: '', interval: 'weekly' }, new Date('2026-11-01'));
  assert.equal(report.totals.participants, 1);
  assert.ok(!JSON.stringify(report).includes('"studentId"'));
});
test('access is rechecked even when cached, and disabled account cannot receive old data', async () => {
  const f = fixture(); await f.loader.input(); f.active(false);
  await assert.rejects(f.loader.input(), error => error.code === 'permission-denied');
  f.active(true); await f.loader.input(); assert.equal(f.reads(), Object.keys(STATISTICS_FIELDS).length * 2);
});
test('account change during a request discards the result', async () => {
  const f = fixture();
  f.source.records = async () => { f.account('different-admin'); return []; };
  await assert.rejects(f.loader.input(), error => error.code === 'permission-denied');
});
test('collection overflow fails instead of producing partial statistics', async () => {
  const f = fixture(); f.source.records = async () => Array.from({ length: MAX_STATISTICS_RECORDS + 1 }, (_, i) => ({ id: String(i) }));
  await assert.rejects(f.loader.input(), error => error.code === 'statistics/capacity');
});
test('failed refresh never silently returns a stale report', async () => {
  const f = fixture(); await f.loader.input(); f.fail(true);
  await assert.rejects(f.loader.input(true), /offline/);
  await assert.rejects(f.loader.input(), /offline/);
});

test('report input replaces identities consistently, preserves aggregate results and rotates on refresh', async () => {
  const f = fixture();
  const ids = Array.from({ length: 5 }, (_, i) => `PRIVATE_STUDENT_${i}`);
  const facilitator = 'PRIVATE_FACILITATOR';
  const questionIds = [...new Set(SCALES.flatMap(scale => scale.ids))];
  const definition = { id: 'public-template', analyticsScoringVersion: 'standard-v1', title: 'Standard assessment', questions: questionIds.map(id => ({ id, type: 'multiple_choice', options: ['0', '1', '2', '3'].map(id => ({ id })) })) };
  const data = {
    users: [...ids.map(id => ({ id, role: 'student', campus: 'lipa', createdAt: '2026-01-01' })), { id: facilitator, role: 'facilitator' }],
    campuses: [{ id: 'lipa', key: 'lipa', label: 'Lipa' }],
    appointments: [{ id: 'PRIVATE_APPOINTMENT', studentId: ids[0], createdAt: '2026-10-05' }],
    conversations: [{ id: 'PRIVATE_CONVERSATION', participantIds: [ids[0], facilitator] }],
    messages: [{ id: 'PRIVATE_MESSAGE', senderId: ids[0], conversationId: 'PRIVATE_CONVERSATION', type: 'text', status: 'sent', createdAt: '2026-10-05' }],
    facilitator_student_links: [{ id: `${facilitator}_${ids[0]}`, facilitatorId: facilitator, studentId: ids[0], status: 'accepted', requestedAt: '2026-10-01', respondedAt: '2026-10-02' }],
    assessment_attempts: ids.flatMap(studentId => ['z', 'a'].map((id, index) => ({ id: `PRIVATE_${studentId}_${id}`, studentId, assessmentId: definition.id, status: 'submitted', campus: 'lipa', startedAt: '2026-10-03', submittedAt: '2026-10-05', answers: questionIds.map(questionId => ({ questionId, value: String(index + 1) })) }))),
    assessments: [definition],
  };
  f.source.records = async name => structuredClone(data[name] ?? []);
  const input = await f.loader.input();
  assert.equal(JSON.stringify(input).includes('PRIVATE_'), false);
  assert.equal(input.users[0].id, input.appointments[0].studentId);
  assert.equal(input.users[0].id, input.messages[0].senderId);
  assert.equal(input.conversations[0].id, input.messages[0].conversationId);
  assert.equal(input.links[0].id, `${input.links[0].facilitatorId}_${input.links[0].studentId}`);
  const filters = { startDate: '2026-10-01', endDate: '2026-10-31', campus: '', assessmentId: '', interval: 'weekly' };
  const raw = { users: data.users, campuses: data.campuses, appointments: data.appointments, conversations: data.conversations, messages: data.messages, links: data.facilitator_student_links, attempts: data.assessment_attempts, definitions: data.assessments, legacyInstances: [] };
  const now = new Date('2026-11-01');
  const expected = buildStatistics(raw, filters, now);
  assert.equal(expected.totals.messagingStudents, 1);
  assert.deepEqual(buildStatistics(input, filters, now), expected);
  assert.equal(await f.loader.input(), input);
  const refreshed = await f.loader.input(true);
  assert.notEqual(refreshed.users[0].id, input.users[0].id);
  assert.deepEqual(buildStatistics(refreshed, filters, now), expected);
});

test('malformed link document IDs cannot become valid relationships during pseudonymization', async () => {
  const f = fixture();
  f.source.records = async name => name === 'facilitator_student_links' ? [{ id: 'incorrect', facilitatorId: 'fac', studentId: 'student', status: 'accepted' }] : [];
  const input = await f.loader.input();
  assert.notEqual(input.links[0].id, `${input.links[0].facilitatorId}_${input.links[0].studentId}`);
});

test('audit display drops identities and free-text metadata while retaining event meaning', () => {
  const rows = [{ id: 'PRIVATE_EVENT', actorId: 'PRIVATE_UID', resourceId: 'PRIVATE_UID', action: 'SUPERADMIN_UPDATED_STUDENT_PROFILE', resource: 'profiles', createdAt: '2026-10-05', metadata: { adminEmail: 'PRIVATE_EMAIL', resourceName: 'PRIVATE_NAME', reason: 'PRIVATE_NOTES', changedFields: ['campus', 'PRIVATE_PAYLOAD'] } }];
  const output = pseudonymizeAuditRows(rows);
  assert.equal(JSON.stringify(output).includes('PRIVATE_'), false);
  assert.equal(output[0].actorLabel, output[0].targetLabel);
  assert.deepEqual(output[0].changedFields, ['campus']);
  assert.equal(output[0].action, rows[0].action);
  assert.equal(output[0].createdAt, rows[0].createdAt);
  assert.notEqual(pseudonymizeAuditRows(rows)[0].actorLabel, output[0].actorLabel);
  assert.equal(rows[0].actorId, 'PRIVATE_UID', 'immutable source audit records are not modified');
});
