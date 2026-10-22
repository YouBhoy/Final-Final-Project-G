import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const transpile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const campusUrl = moduleUrl(transpile(await readFile(new URL('../../../packages/shared-types/src/constants/campuses.ts', import.meta.url), 'utf8')));
const overviewUrl = moduleUrl(transpile(await readFile(new URL('../src/lib/adminDashboard.ts', import.meta.url), 'utf8'))
  .replace(/(['"])@spartan-g\/shared-types\1/g, JSON.stringify(campusUrl)));
const { dashboardOverview, dashboardMonth } = await import(overviewUrl);
const { ALL_CAMPUSES } = await import(campusUrl);
const user = (id, role = 'student', isActive = true, campus = ALL_CAMPUSES[0]) => ({ id, uid: id, displayName: id, role, isActive, campus });
const link = (studentId, facilitatorId, status) => ({ studentId, facilitatorId, status });

test('only accepted connections to active facilitators cover active students', () => {
  const result = dashboardOverview([
    user('covered'), user('pending'), user('rejected'), user('inactive-facilitator'), user('missing-facilitator'), user('disabled-student', 'student', false),
    user('facilitator', 'facilitator'), user('disabled', 'facilitator', false), user('admin', 'super_admin'),
  ], [], [link('covered', 'facilitator', 'accepted'), link('covered', 'facilitator', 'accepted'), link('pending', 'facilitator', 'pending'), link('rejected', 'facilitator', 'rejected'), link('inactive-facilitator', 'disabled', 'accepted'), link('missing-facilitator', 'missing', 'accepted')]);
  assert.equal(result.students.length, 6);
  assert.equal(result.facilitators.length, 1);
  assert.deepEqual(result.unlinked.map(row => row.id), ['pending', 'rejected', 'inactive-facilitator', 'missing-facilitator']);
});

test('campus overrides and custom campuses preserve settings and active account counts', () => {
  const result = dashboardOverview([user('student'), user('disabled-student', 'student', false), user('facilitator', 'facilitator'), user('custom-student', 'student', true, 'custom')], [
    { key: ALL_CAMPUSES[0], label: 'Renamed campus', isActive: false },
    { key: 'custom', label: 'Custom campus', isActive: true },
  ], []);
  assert.equal(result.campuses.length, ALL_CAMPUSES.length + 1);
  const renamed = result.campuses.find(row => row.key === ALL_CAMPUSES[0]);
  assert.equal(renamed.label, 'Renamed campus');
  assert.equal(renamed.students, 1);
  assert.equal(renamed.facilitators, 1);
  assert.ok(!result.uncovered.some(row => row.key === renamed.key));
  assert.ok(result.uncovered.some(row => row.key === 'custom'));
});

test('empty data retains the built-in campus catalogue without inventing accounts', () => {
  const result = dashboardOverview([], [], []);
  assert.equal(result.students.length, 0);
  assert.equal(result.unlinked.length, 0);
  assert.equal(result.uncovered.length, ALL_CAMPUSES.length);
});

test('monthly reporting follows Manila month and year boundaries', () => {
  assert.deepEqual(dashboardMonth(new Date('2026-12-31T16:00:00Z')), { startDate: '2027-01-01', endDate: '2027-01-01' });
  assert.deepEqual(dashboardMonth(new Date('2026-10-31T15:59:59Z')), { startDate: '2026-10-01', endDate: '2026-10-31' });
});

const fixtureUrl = moduleUrl(`
export const userRepository = { getAll: () => globalThis.__dashboardTest.users() };
export const campusRepository = { getAllCampuses: () => globalThis.__dashboardTest.campuses() };
export const facilitatorStudentLinkRepository = { getAll: () => globalThis.__dashboardTest.links() };
export const auditService = { listRecent: maximum => globalThis.__dashboardTest.activity(maximum) };
export const loadStatistics = (...args) => globalThis.__dashboardTest.statistics(...args);
export const statisticsError = cause => cause.message;
`);
const pseudonymizationUrl = moduleUrl(transpile(await readFile(new URL('../src/lib/pseudonymization.ts', import.meta.url), 'utf8')));
const hookCode = transpile(await readFile(new URL('../src/hooks/useAdminDashboard.ts', import.meta.url), 'utf8'))
  .replace(/(['"])react\1/g, JSON.stringify(import.meta.resolve('react')))
  .replace(/(['"])@spartan-g\/shared-services\1/g, JSON.stringify(fixtureUrl))
  .replace(/(['"])\.\.\/lib\/statistics\1/g, JSON.stringify(fixtureUrl))
  .replace(/(['"])\.\.\/lib\/pseudonymization\1/g, JSON.stringify(pseudonymizationUrl))
  .replace(/(['"])\.\.\/lib\/adminDashboard\1/g, JSON.stringify(overviewUrl));
const hookUrl = moduleUrl(hookCode);
const { useAdminDashboard } = await import(hookUrl);
let root;
afterEach(() => { if (root) act(() => root.unmount()); root = null; delete globalThis.__dashboardTest; });
function setup(overrides = {}) {
  globalThis.__dashboardTest = {
    users: async () => [user('student')], campuses: async () => [], links: async () => [],
    activity: async maximum => { assert.equal(maximum, 6); return []; },
    statistics: async () => ({ totals: { submissions: 12 } }), ...overrides,
  };
  let current;
  function Harness() { current = useAdminDashboard(); return null; }
  return { mount: async () => { await act(async () => { root = Renderer.create(React.createElement(Harness)); }); }, get current() { return current; } };
}

test('failed statistics never become zero and do not hide account or activity data', async () => {
  const fixture = setup({ statistics: async () => { throw new Error('Statistics unavailable'); } });
  await fixture.mount();
  assert.equal(fixture.current.submissions.data, null);
  assert.equal(fixture.current.submissions.error, 'Statistics unavailable');
  assert.equal(fixture.current.users.data.length, 1);
  assert.deepEqual(fixture.current.activity.data, []);
  assert.equal(fixture.current.loading, false);
});

test('refresh clears previous data while loading and bypasses the statistics cache', async () => {
  let resolveUsers;
  const cacheFlags = [];
  const fixture = setup({ statistics: async (_filters, options) => { cacheFlags.push(options.forceRefresh); return { totals: { submissions: 12 } }; } });
  await fixture.mount();
  globalThis.__dashboardTest.users = () => new Promise(resolve => { resolveUsers = resolve; });
  await act(async () => fixture.current.refresh());
  assert.equal(fixture.current.users.data, null);
  assert.equal(fixture.current.users.loading, true);
  assert.deepEqual(cacheFlags, [false, true]);
  await act(async () => resolveUsers([user('new-student', 'student', true, 'new-campus')]));
  assert.equal(fixture.current.users.data[0].campus, 'new-campus');
  assert.notEqual(fixture.current.users.data[0].id, 'new-student');
});

test('results from an older refresh cannot replace the latest data', async () => {
  let resolveOld;
  const fixture = setup({ users: () => new Promise(resolve => { resolveOld = resolve; }) });
  await fixture.mount();
  globalThis.__dashboardTest.users = async () => [user('latest-student', 'student', true, 'latest-campus')];
  await act(async () => fixture.current.refresh());
  await act(async () => resolveOld([user('old-student')]));
  assert.equal(fixture.current.users.data[0].campus, 'latest-campus');
});

const authUrl = moduleUrl('export function useAuth() { return { user: globalThis.__dashboardTest.actor }; }');
const cardUrl = moduleUrl(transpile(await readFile(new URL('../src/components/ui/Card.tsx', import.meta.url), 'utf8'))
  .replace(/(['"])react\/jsx-runtime\1/g, JSON.stringify(import.meta.resolve('react/jsx-runtime'))));
const pageCode = transpile(await readFile(new URL('../src/pages/admin/AdminDashboardPage.tsx', import.meta.url), 'utf8'))
  .replace(/(['"])react-router-dom\1/g, JSON.stringify(import.meta.resolve('react-router-dom')))
  .replace(/(['"])react\/jsx-runtime\1/g, JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replace(/(['"])\.\.\/\.\.\/hooks\/useAuth\1/g, JSON.stringify(authUrl))
  .replace(/(['"])\.\.\/\.\.\/hooks\/useAdminDashboard\1/g, JSON.stringify(hookUrl))
  .replace(/(['"])\.\.\/\.\.\/lib\/adminDashboard\1/g, JSON.stringify(overviewUrl))
  .replace(/(['"])\.\.\/\.\.\/components\/ui\/Card\1/g, JSON.stringify(cardUrl));
const { AdminDashboardPage } = await import(moduleUrl(pageCode));
async function mountPage(actor, overrides = {}) {
  setup(overrides);
  globalThis.__dashboardTest.actor = actor;
  await act(async () => {
    root = Renderer.create(React.createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, React.createElement(AdminDashboardPage)));
  });
}

test('unauthorized accounts cannot start dashboard data reads', async () => {
  let reads = 0;
  await mountPage({ uid: 'student', role: 'student' }, { users: async () => { reads++; return []; } });
  assert.equal(reads, 0);
  assert.ok(root.root.findByProps({ role: 'alert' }));
});

test('dashboard renders totals and navigation without the removed attention card', async () => {
  await mountPage({ uid: 'admin', role: 'super_admin' });
  const rendered = JSON.stringify(root.toJSON());
  assert.ok(rendered.includes('Assessments submitted'));
  assert.ok(rendered.includes('12'));
  assert.ok(rendered.includes('No admin activity yet.'));
  const destinations = root.root.findAllByType('a').map(anchor => anchor.props.href);
  assert.ok(!rendered.includes('Needs attention'));
  assert.ok(!destinations.includes('/admin/users/student'));
  assert.ok(destinations.includes('/admin/statistics'));
});

test('an unavailable campus source renders its error without claiming healthy coverage', async () => {
  await mountPage({ uid: 'admin', role: 'super_admin' }, { campuses: async () => { throw new Error('Campuses unavailable'); } });
  const rendered = JSON.stringify(root.toJSON());
  assert.ok(rendered.includes('Campuses unavailable'));
  assert.ok(!rendered.includes('All active students have an active facilitator connection.'));
  assert.ok(rendered.includes('Campus overview'));
});

test('dashboard state excludes real user identities and audit metadata', async () => {
  const fixture = setup({
    users: async () => [{ ...user('PRIVATE_UID'), displayName: 'PRIVATE_NAME', email: 'PRIVATE_EMAIL' }],
    activity: async () => [{ id: 'PRIVATE_EVENT', actorId: 'PRIVATE_UID', resourceId: 'PRIVATE_TARGET', action: 'SUPERADMIN_UPDATED_USER', resource: 'users', metadata: { adminEmail: 'PRIVATE_EMAIL', resourceName: 'PRIVATE_NAME' } }],
    links: async () => { throw new Error('Removed coverage section must not fetch relationships'); },
  });
  await fixture.mount();
  assert.equal(JSON.stringify(fixture.current.users.data).includes('PRIVATE_'), false);
  assert.equal(JSON.stringify(fixture.current.activity.data).includes('PRIVATE_'), false);
  assert.equal(fixture.current.loading, false);
});
