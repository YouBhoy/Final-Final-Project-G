import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStatisticsLoader, STATISTICS_FIELDS, MAX_STATISTICS_RECORDS, buildStatistics } from './helpers/statisticsModules.mjs';

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
