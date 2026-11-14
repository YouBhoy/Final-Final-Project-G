import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardModules, dashboardFixture, deferred } from './helpers/dashboardModules.mjs';
const { createDashboardCache, SUMMARY_FRESHNESS_MS, dashboardError, mapDashboardReads } = dashboardModules().load('lib/dashboardData.ts');
const scope = { project: 'test', database: '(default)', uid: 'one', role: 'student' };
function fixture() {
  let current = scope, allowed = true, now = 0, authorizations = 0;
  const cache = createDashboardCache({ current: () => current, now: () => now, authorize: async () => { authorizations++; if (!allowed) throw { code: 'permission-denied' }; } });
  return { cache, setCurrent: value => { current = value; }, deny: () => { allowed = false; }, tick: value => { now += value; }, get authorizations() { return authorizations; } };
}
test('successful empty results are cached only when a TTL is explicitly allowed', async () => {
  const f = fixture(); let count = 0;
  const read = () => f.cache.read(scope, 'catalog', async () => { count++; return []; }, SUMMARY_FRESHNESS_MS);
  assert.deepEqual(await read(), []); assert.deepEqual(await read(), []);
  assert.equal(count, 1); assert.ok(f.authorizations >= 4);
});
test('15 minute freshness expires from load time, never from a cache hit', async () => {
  const f = fixture(); let count = 0;
  const read = () => f.cache.read(scope, 'catalog', async () => ++count, 999999999);
  assert.equal(await read(), 1); f.tick(SUMMARY_FRESHNESS_MS - 1); assert.equal(await read(), 1);
  f.tick(1); assert.equal(await read(), 2);
});
test('concurrent authorized appointment requests coalesce, subsequent reads stay fresh', async () => {
  const f = fixture(), gate = deferred(); let count = 0;
  const load = () => { count++; return gate.promise; };
  const first = f.cache.read(scope, 'appointments', load), second = f.cache.read(scope, 'appointments', load);
  await new Promise(resolve => setImmediate(resolve)); assert.equal(count, 1);
  gate.resolve(['accepted']); assert.deepEqual(await first, await second);
  assert.deepEqual(await f.cache.read(scope, 'appointments', async () => { count++; return ['completed']; }), ['completed']);
  assert.equal(count, 2);
});
test('cached data never bypasses revoked server authorization', async () => {
  const f = fixture(); await f.cache.read(scope, 'catalog', async () => [1], SUMMARY_FRESHNESS_MS);
  f.deny(); await assert.rejects(f.cache.read(scope, 'catalog', async () => [2], SUMMARY_FRESHNESS_MS), { code: 'permission-denied' });
});
for (const field of ['uid', 'role', 'project', 'database']) test('cache isolation includes ' + field, async () => {
  const f = fixture(); await f.cache.read(scope, 'catalog', async () => ['old'], SUMMARY_FRESHNESS_MS);
  const next = { ...scope, [field]: field === 'role' ? 'facilitator' : 'different' }; f.setCurrent(next);
  assert.deepEqual(await f.cache.read(next, 'catalog', async () => ['new'], SUMMARY_FRESHNESS_MS), ['new']);
  await assert.rejects(f.cache.read(scope, 'catalog', async () => ['old']), /session-expired/);
});
test('different query filters do not collide', async () => {
  const f = fixture();
  await f.cache.read(scope, 'summary:month=11', async () => 11, SUMMARY_FRESHNESS_MS);
  assert.equal(await f.cache.read(scope, 'summary:month=12', async () => 12, SUMMARY_FRESHNESS_MS), 12);
});
test('logout clears results and fences late reads even after signing back into the same account', async () => {
  const f = fixture(), gate = deferred();
  const read = f.cache.read(scope, 'catalog', () => gate.promise, SUMMARY_FRESHNESS_MS);
  await new Promise(resolve => setImmediate(resolve)); f.setCurrent(null); f.cache.clear(); f.setCurrent(scope);
  gate.resolve(['old']); await assert.rejects(read, /session-expired/);
  assert.deepEqual(await f.cache.read(scope, 'catalog', async () => ['new'], SUMMARY_FRESHNESS_MS), ['new']);
});
test('mutation invalidation rejects stale in-flight results and reloads the updated appointment', async () => {
  const f = fixture(), gate = deferred();
  const read = f.cache.read(scope, 'appointments', () => gate.promise);
  await new Promise(resolve => setImmediate(resolve)); f.cache.invalidate(scope, 'appointments'); gate.resolve(['requested']);
  await assert.rejects(read, /superseded/);
  assert.deepEqual(await f.cache.read(scope, 'appointments', async () => ['accepted']), ['accepted']);
});
test('network failures are not cached and do not become empty data', async () => {
  const f = fixture();
  await assert.rejects(f.cache.read(scope, 'notifications', async () => { throw { code: 'unavailable' }; }), { code: 'unavailable' });
  assert.deepEqual(await f.cache.read(scope, 'notifications', async () => []), []);
});
test('dashboard errors classify permission, network and expired auth without exposing internals', () => {
  for (const cause of [{ code: 'permission-denied' }, new Error('Failed to list private-uid: network unavailable'), { code: 'auth/user-token-expired' }, new Error('private-uid/token?')])
    assert.doesNotMatch(dashboardError(cause), /private-uid|token\?|Failed to list/);
  assert.match(dashboardError({ code: 'unauthenticated' }), /Sign in/);
  assert.match(dashboardError({ cause: { code: 'permission-denied' } }), /account/);
});
test('bounded parallel reads preserve ordering when requests finish out of order', async () => {
  const gates = Array.from({ length: 7 }, deferred); let active = 0, peak = 0;
  const result = mapDashboardReads(gates, async (gate) => { active++; peak = Math.max(peak, active); const value = await gate.promise; active--; return value; });
  assert.equal(peak, 4);
  for (const i of [3, 2, 1, 0, 6, 5, 4]) { gates[i].resolve(i); await new Promise(resolve => setImmediate(resolve)); }
  assert.deepEqual(await result, [0, 1, 2, 3, 4, 5, 6]); assert.equal(peak, 4);
});
test('bounded reads stop queueing new work after a failure and never return partial totals', async () => {
  const gate = deferred(); let calls = 0;
  const result = mapDashboardReads([0, 1, 2, 3, 4], async id => { calls++; if (id === 0) throw { code: 'unavailable' }; await gate.promise; return id; }, 2);
  await assert.rejects(result, { code: 'unavailable' }); gate.resolve(); await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
});
test('runtime preserves authorized role/owner scope and rejects missing tab sessions', async () => {
  const f = dashboardFixture(); await f.runtime.readDashboardAppointments(f.scope());
  assert.deepEqual(f.state.lastAppointmentScope, ['student-one', 'student']);
  f.state.tab = false; await assert.rejects(f.runtime.readDashboardAppointments(f.scope()), /session-expired/);
  assert.equal(f.state.reads.appointments, 1);
});
test('runtime rejects inactive or changed roles before requesting appointment data', async () => {
  const f = dashboardFixture(); f.state.profile.isActive = false;
  await assert.rejects(f.runtime.readDashboardAppointments(f.scope()), /permission-denied/);
  f.state.profile = { isActive: true, role: 'facilitator' };
  await assert.rejects(f.runtime.readDashboardAppointments(f.scope()), /permission-denied/);
  assert.equal(f.state.reads.appointments, 0);
});
test('scoped live changes invalidate appointments and listeners are removed on cleanup', async () => {
  const f = dashboardFixture('facilitator'); let changes = 0, failures = [];
  const stop = f.runtime.watchDashboard(f.scope(), () => changes++, (key, error) => failures.push([key, error.code]));
  for (const listener of f.state.listeners) assert.deepEqual(listener.ref.constraints, [[listener.ref.name === 'notifications' ? 'userId' : 'facilitatorId', '==', 'facilitator-one']]);
  f.emit('appointments'); assert.equal(changes, 0);
  f.emit('appointments'); await new Promise(resolve => setImmediate(resolve)); assert.equal(changes, 1);
  f.emit('appointments', { code: 'permission-denied' }); assert.deepEqual(failures, [['appointments', 'permission-denied']]);
  stop(); assert.ok(f.state.listeners.every(listener => listener.stopped));
  f.emit('appointments'); assert.equal(changes, 1);
});
