import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Renderer, { act } from 'react-test-renderer';

const moduleUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText
  .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replaceAll("'react/jsx-runtime'", JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')))
  .replaceAll('"react"', JSON.stringify(import.meta.resolve('react')));
const campuses = moduleUrl(await readFile(new URL('../../../packages/shared-types/src/constants/campuses.ts', import.meta.url), 'utf8')
  .then(compile));
const card = moduleUrl(compile(await readFile(new URL('../src/components/ui/Card.tsx', import.meta.url), 'utf8')));
const charts = moduleUrl(compile(await readFile(new URL('../src/components/analytics/AnalyticsCharts.tsx', import.meta.url), 'utf8')));
const views = moduleUrl(compile(await readFile(new URL('../src/components/statistics/StatisticsViews.tsx', import.meta.url), 'utf8'))
  .replaceAll("'@spartan-g/shared-types'", JSON.stringify(campuses))
  .replaceAll("'../ui/Card'", JSON.stringify(card))
  .replaceAll("'../analytics/AnalyticsCharts'", JSON.stringify(charts)));
const { StatisticsOverviewView } = await import(views);

const pageFixture = moduleUrl('import React from ' + JSON.stringify(import.meta.resolve('react')) + ';' +
  'export const useAuth = () => ({ user: globalThis.__overviewUser });' +
  'export const StatisticsPanel = ({view}) => React.createElement("div", {"data-view": view}, view);');
const page = moduleUrl(compile(await readFile(new URL('../src/pages/admin/AdminStatisticsPage.tsx', import.meta.url), 'utf8'))
  .replaceAll("'../../hooks/useAuth'", JSON.stringify(pageFixture))
  .replaceAll("'../../components/statistics/StatisticsPanel'", JSON.stringify(pageFixture)));
const { AdminStatisticsPage } = await import(page);

const reportFixture = (empty = false) => ({
  generatedAt: '2026-11-15T00:00:00.000Z',
  filters: { startDate: '2025-12-01', endDate: '2026-11-15', campus: '', assessmentId: '', interval: 'monthly' },
  campuses: [], assessments: [], coverage: {}, notes: [],
  attemptDataQuality: { invalidRecords: 0, duplicateLogicalAttempts: 0, missingRequiredFields: 0,
    invalidStatuses: 0, invalidTimestamps: 0, invalidAttemptNumbers: 0, identityMismatches: 0 },
  accountActivity: {
    studentAccounts: empty ? 0 : 120, activeStudentAccounts: empty ? 0 : 118, studentsWithUnknownActiveStatus: 0,
    facilitatorAccounts: empty ? 0 : 15, activeFacilitatorAccounts: empty ? 0 : 15, facilitatorsWithUnknownActiveStatus: 0,
    acceptedStudentLinks: empty ? 0 : 32, facilitatorsWithAcceptedStudents: empty ? 0 : 10,
    facilitatorsWithRequests: empty ? 0 : 4,
  },
  totals: {
    participants: empty ? 0 : 80, appointmentStudents: 0, messagingStudents: 0, assessmentStudents: empty ? 0 : 18,
    appointmentRequests: 0, attempts: empty ? 0 : 26, submissions: empty ? 0 : 22, registered: 0,
    participationRate: null, starters: empty ? 0 : 20, completedStarters: empty ? 0 : 15,
    incompleteStarters: empty ? 0 : 5, completionRate: empty ? null : 75, inProgress: 0, retakes: 0,
    submissionRate: null, averageAttemptsPerStudent: null,
  },
  trends: empty ? [] : [
    { label: 'Sep', participants: 25 },
    { label: 'Oct', participants: 40 },
    { label: 'Nov', participants: 15 },
  ],
  gradedScores: empty ? [] : [
    { assessmentId: 'biology', title: 'Biology assessment', suppressed: false, sample: 20, mean: 82.5, median: 80,
      bins: [{ label: '0-49', count: 5 }, { label: '50-59', count: 0 }, { label: '60-69', count: 0 },
        { label: '70-79', count: 5 }, { label: '80-89', count: 5 }, { label: '90-100', count: 5 }] },
    { assessmentId: 'sparse', title: 'Sparse score bands', suppressed: false, sample: 8, mean: 78, median: 80,
      bins: [{ label: '0-49', count: null }, { label: '50-59', count: null }, { label: '60-69', count: null },
        { label: '70-79', count: null }, { label: '80-89', count: null }, { label: '90-100', count: null }] },
    { assessmentId: 'small', title: 'Hidden small cohort', suppressed: true, sample: null, mean: null, median: null,
      bins: [{ label: '0-49', count: null }, { label: '50-59', count: null }] },
  ],
});

test('Statistics opens on Overview and keeps every existing tab accessible', async () => {
  globalThis.__overviewUser = { uid: 'super-admin', role: 'super_admin' };
  let root;
  await act(async () => { root = Renderer.create(React.createElement(AdminStatisticsPage)); });
  try {
    const tabs = root.root.findAll(node => node.props.role === 'tab');
    assert.deepEqual(tabs.map(tab => tab.findAllByType('span')[0].children[0]), [
      'Overview', 'Referral Analytics', 'Referral Forecast', 'Participation', 'Trends', 'Assessment Scores',
    ]);
    assert.equal(tabs[0].props['aria-selected'], true);
    assert.equal(root.root.findAll(node => node.props['data-view'] === 'overview').length, 1);
    await act(async () => { tabs[1].props.onClick(); });
    assert.equal(root.root.findAll(node => node.props['data-view'] === 'referrals').length, 1);
    assert.equal(root.root.findAll(node => node.props.role === 'tab' && node.props['aria-selected']).length, 1);
    assert.equal(root.root.findAll(node => node.props.role === 'tab').length, 6);
  } finally {
    act(() => root.unmount());
    delete globalThis.__overviewUser;
  }
});

test('Statistics remains restricted to Super Admins', () => {
  globalThis.__overviewUser = { uid: 'regular-admin', role: 'admin' };
  const html = renderToStaticMarkup(React.createElement(AdminStatisticsPage));
  delete globalThis.__overviewUser;
  assert.ok(html.includes('Statistics requires a super administrator account.'));
  assert.ok(!html.includes('statistics-tab-overview'));
});

test('Overview renders account, activity, completion and privacy-safe graded analytics', () => {
  const html = renderToStaticMarkup(React.createElement(StatisticsOverviewView, { report: reportFixture(), activity: 'participants' }));
  for (const expected of [
    'Total students', '120', 'Total facilitators', '15', 'Active accounts', '133',
    'Accepted student-facilitator links', '32', 'Facilitators receiving appointment requests', '4',
    'Account distribution', 'Monthly activity trend', 'Assessment completion', 'Graded score distribution',
    'Assessment completion rate', '75%', 'Released graded score records by percentage band',
    'Mean score by assessment (%)', 'Biology assessment', 'Sparse score bands',
    'Counts represent grade records, not unique students', 'Some assessment distributions are omitted',
  ]) assert.ok(html.includes(expected), expected);
  assert.ok(!html.includes('Hidden small cohort'), 'suppressed assessment identities are not rendered');
  assert.ok(html.includes('aria-label=\"Monthly unique participating students\"'));
});

test('Overview reports empty data and unavailable account activity without fabricating values', () => {
  const empty = reportFixture(true);
  empty.accountActivity.activeStudentAccounts = null;
  empty.accountActivity.activeFacilitatorAccounts = null;
  empty.accountActivity.studentsWithUnknownActiveStatus = 1;
  empty.accountActivity.facilitatorsWithUnknownActiveStatus = 1;
  const html = renderToStaticMarkup(React.createElement(StatisticsOverviewView, { report: empty, activity: 'participants' }));
  for (const expected of [
    'No participation activity was recorded', 'Unavailable', 'No assessment starters in the selected period.',
    'No current account distribution by role data is available yet.',
    'No monthly unique participating students recorded in this period.',
    'No assessment completion among starters data is available yet.',
    'No score-band distributions are available for this selection.',
    'Unavailable because 2 accounts have no readable active status.',
  ]) assert.ok(html.includes(expected), expected);
});

const statisticsModule = moduleUrl('export const loadStatistics = (...args) => globalThis.__overviewLoad(...args);' +
  'export const statisticsError = cause => cause instanceof Error ? cause.message : "Unable to load statistics";');
const sharedTypesModule = moduleUrl('export const ALL_CAMPUSES = [];' +
  'export const getCampusLabel = key => key;');
const componentFixture = moduleUrl('import React from ' + JSON.stringify(import.meta.resolve('react')) + ';' +
  'export const Button = props => React.createElement("button", props, props.children);' +
  'export const Spinner = ({label}) => React.createElement("span", null, label);');
const panelSource = compile(await readFile(new URL('../src/components/statistics/StatisticsPanel.tsx', import.meta.url), 'utf8'))
  .replaceAll("'@spartan-g/shared-types'", JSON.stringify(sharedTypesModule))
  .replaceAll("'../../lib/statistics'", JSON.stringify(statisticsModule))
  .replaceAll("'../ui/Button'", JSON.stringify(componentFixture))
  .replaceAll("'../ui/Card'", JSON.stringify(card))
  .replaceAll("'../ui/Spinner'", JSON.stringify(componentFixture))
  .replaceAll("'./StatisticsViews'", JSON.stringify(views));
const panelModule = await import(moduleUrl(panelSource));
let panelRoot;
afterEach(() => {
  if (panelRoot) act(() => panelRoot.unmount());
  panelRoot = null;
  delete globalThis.__overviewLoad;
});

test('Overview exposes its loading state while the Firebase-backed report is pending', async () => {
  globalThis.__overviewLoad = () => new Promise(() => {});
  await act(async () => { panelRoot = Renderer.create(React.createElement(panelModule.StatisticsPanel, { view: 'overview' })); });
  assert.ok(JSON.stringify(panelRoot.toJSON()).includes('Preparing this report...'));
});

test('Overview shows the empty report after a successful load and keeps report errors visible', async () => {
  globalThis.__overviewLoad = () => Promise.resolve(reportFixture(true));
  await act(async () => {
    panelRoot = Renderer.create(React.createElement(panelModule.StatisticsPanel, { view: 'overview' }));
    await Promise.resolve();
  });
  assert.ok(JSON.stringify(panelRoot.toJSON()).includes('No participation activity was recorded'));
  act(() => panelRoot.unmount());
  panelRoot = null;

  globalThis.__overviewLoad = () => Promise.reject(new Error('Firestore permission denied'));
  await act(async () => {
    panelRoot = Renderer.create(React.createElement(panelModule.StatisticsPanel, { view: 'overview' }));
    await Promise.resolve();
  });
  const tree = JSON.stringify(panelRoot.toJSON());
  assert.ok(tree.includes('Firestore permission denied'));
  assert.ok(tree.includes('No report values are shown until a request succeeds.'));
});
