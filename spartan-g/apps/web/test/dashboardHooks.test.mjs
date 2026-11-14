import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { dashboardFixture, dashboardModules, deferred } from './helpers/dashboardModules.mjs';
let root;
afterEach(() => { if (root) act(() => root.unmount()); root = undefined; });
const settle = () => new Promise(resolve => setImmediate(resolve));
async function setup(role = 'student', configure = () => {}) {
  const f = dashboardFixture(role); configure(f);
  const hook = f.modules.load(role === 'student' ? 'hooks/useStudentDashboard.ts' : 'hooks/useFacilitatorDashboard.ts');
  let current;
  function Harness() { current = role === 'student' ? hook.useStudentDashboard() : hook.useFacilitatorDashboard(); return null; }
  await act(async () => { root = Renderer.create(React.createElement(Harness)); await settle(); });
  return { ...f, get current() { return current; }, update: async () => { await act(async () => { root.update(React.createElement(Harness)); await settle(); }); } };
}
test('successful empty student sources show real zero counts and no error', async () => {
  const f = await setup();
  assert.equal(f.current.data.assessments.total, 0);
  assert.equal(f.current.data.notifications.unreadCount, 0);
  assert.deepEqual(f.current.data.appointments.upcoming, []);
  assert.equal(f.current.error, null); assert.equal(f.current.loading, false);
});
for (const role of ['student', 'facilitator']) for (const code of ['permission-denied', 'unavailable', 'unauthenticated']) {
  test(role + ' read failure ' + code + ' remains unavailable instead of zero', async () => {
    const f = await setup(role, ({ state }) => {
      state.appointmentRead = async () => { throw { code, message: 'private-identifier' }; };
      state.notificationError = { code, message: 'private-identifier' };
    });
    assert.equal(f.current.sections.appointments.data, null);
    assert.equal(f.current.sections.notifications.data, null);
    assert.ok(f.current.sections.appointments.error);
    assert.doesNotMatch(f.current.error, /private-identifier/);
    if (role === 'student') assert.equal(f.current.data.assessments.total, 0);
    else assert.equal(f.current.data.todayAppointments, null);
  });
}
test('retry clears failed section and recovers without remounting the portal', async () => {
  const f = await setup('student', ({ state }) => { state.notificationError = { code: 'unavailable' }; });
  assert.equal(f.current.sections.notifications.data, null);
  f.state.notificationError = null;
  await act(async () => { f.current.reload(); await settle(); });
  assert.equal(f.current.sections.notifications.error, null);
  assert.equal(f.current.sections.notifications.data.unreadCount, 0);
});
test('assessment catalogue and submitted attempts start together, progress reads run four at a time in catalogue order', async () => {
  const f = dashboardFixture(), submitted = deferred();
  f.state.published = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }));
  f.state.submittedRead = () => submitted.promise;
  const queries = f.modules.load('lib/dashboardQueries.ts');
  // Catalogue is available while submitted is pending: no sequential waterfall.
  let active = 0, peak = 0;
  const gates = Object.fromEntries(f.state.published.map(({ id }) => [id, deferred()]));
  f.state.progressRead = async id => { active++; peak = Math.max(peak, active); const result = await gates[id].promise; active--; return result; };
  const pending = queries.loadAssessmentProgress(f.scope());
  await settle(); assert.equal(f.state.reads.catalog, 1); assert.equal(f.state.reads.submitted, 1);
  submitted.resolve([{ assessmentId: 'a' }]); await settle();
  assert.deepEqual(f.state.reads.progress, [['a', 'student-one'], ['b', 'student-one'], ['c', 'student-one'], ['d', 'student-one']]);
  gates.d.resolve('d-attempt'); await settle(); gates.e.resolve(null); gates.c.resolve(null); gates.b.resolve('b-attempt'); gates.a.resolve('a-retake');
  const result = await pending;
  assert.deepEqual(result, { total: 5, completed: 1, inProgress: 3, notStarted: 2, resumeAssessmentId: 'a' });
  assert.equal(peak, 4);
  f.state.progressRead = async () => null;
  await queries.loadAssessmentProgress(f.scope());
  assert.equal(f.state.reads.catalog, 1); assert.equal(f.state.reads.submitted, 2);
});
test('one failed assessment progress request makes the section unavailable without fabricating partial totals', async () => {
  const f = await setup('student', ({ state }) => {
    state.published = [{ id: 'a' }, { id: 'b' }];
    state.progressRead = async id => { if (id === 'b') throw { code: 'unavailable' }; return 'a-attempt'; };
  });
  assert.equal(f.current.data.assessments, null); assert.match(f.current.sections.assessments.error, /connection/);
  assert.deepEqual(f.current.data.appointments.upcoming, []);
});
test('facilitator overview uses one appointment query for counters and next appointments', async () => {
  const f = await setup('facilitator', ({ state }) => {
    state.appointments = [
      { id: 'past', facilitatorId: 'facilitator-one', studentId: 'student', scheduledAt: new Date(0), status: 'accepted' },
      { id: 'next', facilitatorId: 'facilitator-one', studentId: 'student', scheduledAt: new Date(Date.now() + 3600000), status: 'accepted' },
      { id: 'request', facilitatorId: 'facilitator-one', studentId: 'student', scheduledAt: new Date(Date.now() + 7200000), status: 'requested' },
    ];
  });
  assert.equal(f.state.reads.appointments, 1);
  assert.equal(f.current.data.todayAppointments.requests, 1);
  assert.deepEqual(f.current.data.upcomingAppointments.map(row => row.id), ['next']);
});
test('simultaneously mounted dashboards share the authorized in-flight appointment request', async () => {
  const f = dashboardFixture('facilitator'), gate = deferred();
  f.state.appointmentRead = () => gate.promise;
  const { useFacilitatorDashboard } = f.modules.load('hooks/useFacilitatorDashboard.ts');
  function Dashboard() { useFacilitatorDashboard(); return null; }
  await act(async () => { root = Renderer.create(React.createElement(React.Fragment, null, React.createElement(Dashboard), React.createElement(Dashboard))); await settle(); });
  assert.equal(f.state.reads.appointments, 1);
  await act(async () => { gate.resolve([]); await settle(); });
});
test('account switching clears prior results and rejects late reads and old listener callbacks', async () => {
  const gate = deferred();
  const f = await setup('student', ({ state }) => { state.appointmentRead = () => gate.promise; });
  const oldListener = f.state.conversations[0];
  f.state.appointmentRead = async () => [];
  f.switchUser({ uid: 'student-two', role: 'student' }); await f.update();
  await act(async () => {
    gate.resolve([{ id: 'old-private-appointment' }]);
    oldListener.next([{ id: 'old-private-conversation', unreadCount: { 'student-one': 5 } }]); await settle();
  });
  assert.deepEqual(f.current.data.appointments.upcoming, []);
  assert.equal(f.current.data.messages.unreadTotal, 0);
  assert.doesNotMatch(JSON.stringify(f.current), /old-private/);
  assert.ok(oldListener.stopped);
  f.switchUser(null); await f.update(); assert.equal(f.current.data, null);
});
test('older refresh cannot overwrite a newer result', async () => {
  const gate = deferred();
  const f = await setup('student', ({ state }) => { state.submittedRead = () => gate.promise; });
  f.state.submittedRead = async () => []; f.state.published = [{ id: 'new' }];
  await act(async () => { f.current.reload(); await settle(); });
  assert.equal(f.current.data.assessments.total, 1);
  await act(async () => { gate.resolve([{ assessmentId: 'old' }]); await settle(); });
  assert.equal(f.current.data.assessments.total, 1);
  assert.equal(f.current.data.assessments.completed, 0);
});
test('appointment changes refresh the overview and listener denial clears stale values', async () => {
  const f = await setup('facilitator');
  f.emit('appointments');
  f.state.appointments = [{ id: 'requested', status: 'requested', scheduledAt: new Date(), studentId: 'student', facilitatorId: 'facilitator-one' }];
  await act(async () => { f.emit('appointments'); await settle(); });
  assert.equal(f.current.data.todayAppointments.requests, 1);
  await act(async () => { f.emit('appointments', { code: 'permission-denied' }); });
  assert.equal(f.current.data.todayAppointments, null);
  assert.match(f.current.sections.appointments.error, /account/);
});
test('conversation listener errors clear unread counts and retry resubscribes', async () => {
  const f = await setup(); const listener = f.state.conversations[0];
  await act(async () => listener.error({ code: 'unavailable', message: 'private-id' }));
  assert.equal(f.current.data.messages, null);
  assert.doesNotMatch(f.current.sections.messages.error, /private-id/);
  await act(async () => { f.current.reload(); await settle(); });
  assert.ok(listener.stopped); assert.equal(f.current.data.messages.unreadTotal, 0);
});
test('asynchronous facilitator identity labels cannot reorder newer conversation snapshots', async () => {
  const f = await setup('facilitator'), gate = deferred();
  f.state.identityRead = async (_, id) => id === 'old-student' ? gate.promise : { displayName: 'Latest permitted label' };
  const listener = f.state.conversations[0];
  await act(async () => {
    listener.next([{ id: 'old', participantIds: ['facilitator-one', 'old-student'] }]);
    listener.next([{ id: 'new', participantIds: ['facilitator-one', 'new-student'] }]); await settle();
  });
  assert.equal(f.current.data.recentConversations[0].id, 'new');
  await act(async () => { gate.resolve({ displayName: 'Old permitted label' }); await settle(); });
  assert.equal(f.current.data.recentConversations[0].id, 'new');
});
test('section presentation distinguishes loading, unavailable, error/retry and successful empty data', async () => {
  const { DashboardReadState } = dashboardModules().load('components/DashboardReadState.tsx');
  let retries = 0;
  const render = section => React.createElement(DashboardReadState, { section, label: 'appointments', retry: () => retries++ }, React.createElement('p', null, 'No upcoming appointments'));
  await act(async () => { root = Renderer.create(render({ data: null, loading: true, error: null })); });
  assert.equal(root.root.findByType('p').children.join(''), 'Loading appointments…'); assert.doesNotMatch(JSON.stringify(root.toJSON()), /No upcoming/);
  await act(async () => root.update(render({ data: null, loading: false, error: 'Unable to connect.' })));
  assert.doesNotMatch(JSON.stringify(root.toJSON()), /No upcoming/);
  act(() => root.root.findByType('button').props.onClick()); assert.equal(retries, 1);
  await act(async () => root.update(render({ data: [], loading: false, error: null })));
  assert.match(JSON.stringify(root.toJSON()), /No upcoming appointments/);
});
