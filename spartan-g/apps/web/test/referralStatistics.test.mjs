import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
} }).outputText.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')))
  .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')));
const card = url(compile(await readFile(new URL('../src/components/ui/Card.tsx', import.meta.url), 'utf8')));
const campuses = url(compile(await readFile(new URL('../../../packages/shared-types/src/constants/campuses.ts', import.meta.url), 'utf8')));
const referralForecast = url(compile(await readFile(new URL('../../../packages/shared-types/src/utils/referralForecast.ts', import.meta.url), 'utf8')));
const sharedTypes = url(`export { ALL_CAMPUSES, getCampusLabel } from ${JSON.stringify(campuses)};
  export { estimateCampusFacilitatorNeed } from ${JSON.stringify(referralForecast)};`);
const charts = url(compile(await readFile(new URL('../src/components/analytics/AnalyticsCharts.tsx', import.meta.url), 'utf8')));
const views = url(compile(await readFile(new URL('../src/components/statistics/StatisticsViews.tsx', import.meta.url), 'utf8'))
  .replaceAll("'@spartan-g/shared-types'", JSON.stringify(sharedTypes))
  .replaceAll("'../ui/Card'", JSON.stringify(card))
  .replaceAll("'../analytics/AnalyticsCharts'", JSON.stringify(charts)));
const { ReferralsView, CoverageDetails, ReferralForecastView, FacilitatorStaffingView } = await import(views);
const { evaluateReferralForecast } = await import('../../../firebase/functions/test/helpers/statisticsModules.mjs');

test('referral presentation labels test data, separates statuses, and never invents model metrics', () => {
  const report = { filters: { interval: 'weekly' }, referrals: {
    forecast: evaluateReferralForecast([]),
    requests: 4, requestingStudents: 2, pending: 1, accepted: 1,
    statuses: [{ key: 'requested', label: 'Pending', requests: 1 }, { key: 'accepted', label: 'Accepted', requests: 1 },
      { key: 'reschedule_requested', label: 'Awaiting reschedule', requests: 1 }, { key: 'unknown', label: 'Unrecognized status', requests: 1 }],
    trends: [{ label: '2026-10-05', startDate: '2026-10-05', endDate: '2026-10-07', partial: true, requests: 4 }],
    coverage: { missingRequestDates: 0, futureDatedRequests: 0, missingCampusSnapshots: 4, missingStudentIds: 0,
      unknownStudentAccounts: 0, conflictingDates: 0, legacyDateFallbacks: 0 },
  } };
  const html = renderToStaticMarkup(React.createElement(ReferralsView, { report }));
  for (const text of ['Development / test-data notice', 'Currently accepted', 'Awaiting reschedule', 'Unrecognized status',
    'Partial: 2026-10-05 to 2026-10-07']) assert.ok(html.includes(text), text);
  assert.ok(!/\d+(\.\d+)?%/.test(html.replace(/<[^>]*>/g, '')), 'no invented forecast confidence or accuracy');
  const forecast = renderToStaticMarkup(React.createElement(ReferralForecastView, { forecast: report.referrals.forecast }));
  assert.ok(forecast.includes('Prototype evaluation on test data'));
  assert.ok(forecast.includes('0 eligible complete weeks'));
  const coverage = renderToStaticMarkup(React.createElement(CoverageDetails, { report, view: 'referrals' }));
  assert.ok(coverage.includes('request-time campus'));
  assert.ok(!coverage.includes('Assessment completion'));
});

test('trained prototype displays measured errors, baseline outcome and chronological test rows', () => {
  const start = Date.parse('2026-06-29T00:00:00+08:00');
  const weeks = Array.from({ length: 12 }, (_, i) => ({ weekStart: new Date(start + i * 7 * 86400000 + 8 * 3600000).toISOString().slice(0, 10), requests: 0 }));
  const forecast = evaluateReferralForecast(weeks);
  const html = renderToStaticMarkup(React.createElement(ReferralForecastView, { forecast }));
  for (const text of ['Learned ridge regression', 'Same as last week (baseline)', 'MAE', 'RMSE',
    'equal MAE', 'Actual requests', 'Production forecasting remains disabled']) assert.ok(html.includes(text), text);
  assert.ok(html.includes(forecast.forecast.weekStart));
  assert.ok(!html.includes('100%'));
});

test('campus staffing recommendation combines demand and availability without inventing a clinical decision', async () => {
  const { estimateCampusFacilitatorNeed } = await import('../../../firebase/functions/test/helpers/statisticsModules.mjs');
  const staffing = estimateCampusFacilitatorNeed({
    predictedWeeklyRequests: 12,
    activeFacilitators: 2,
    activeAvailabilitySlots: 8,
  });
  assert.equal(staffing.status, 'ready');
  assert.equal(staffing.severity, 'high');
  assert.equal(staffing.recommendedFacilitatorCount, 3);
  assert.equal(staffing.additionalFacilitators, 1);
  assert.match(staffing.reason, /planning estimate/i);

  const sparse = estimateCampusFacilitatorNeed({
    predictedWeeklyRequests: null,
    activeFacilitators: 2,
  });
  assert.equal(sparse.status, 'insufficient');
  assert.equal(sparse.recommendedFacilitatorCount, null);
});

test('all-campus staffing view renders campus charts and does not require a campus filter', () => {
  const report = {
    filters: { campus: '' },
    referrals: { forecast: { forecast: null } },
  };
  const workloadRows = [
    { id: 'lipa', campusKey: 'lipa', campusLabel: 'Lipa Campus', facilitatorCount: { value: 5 }, activeAvailabilitySlots: { value: 10 }, monthlyRequests: { value: 20 } },
    { id: 'alangilan', campusKey: 'alangilan', campusLabel: 'Alangilan', facilitatorCount: { value: 3 }, activeAvailabilitySlots: { value: 6 }, monthlyRequests: { value: 30 } },
  ];
  const html = renderToStaticMarkup(React.createElement(FacilitatorStaffingView, { report, workloadRows }));
  assert.ok(html.includes('Recommended facilitators by campus'));
  assert.ok(html.includes('Predicted weekly referrals by campus'));
  assert.ok(html.includes('Lipa Campus'));
  assert.ok(html.includes('Alangilan'));
  assert.ok(!html.includes('Select one campus above'));
});

test('all-campus staffing uses a clearly labeled synthetic fallback when workload aggregates are empty', () => {
  const report = {
    filters: { campus: '' },
    campuses: [
      { key: 'lipa', label: 'Lipa Campus' },
      { key: 'alangilan', label: 'Alangilan' },
    ],
    referrals: { forecast: { forecast: null } },
  };
  const html = renderToStaticMarkup(React.createElement(FacilitatorStaffingView, { report, workloadRows: [] }));
  assert.ok(html.includes('Synthetic showcase data'));
  assert.ok(html.includes('Recommended facilitators by campus'));
  assert.ok(!html.includes('No campus workload aggregates'));
});

test('selected-campus staffing also uses synthetic workload fallback instead of insufficient data', () => {
  const report = {
    filters: { campus: 'lipa' },
    campuses: [{ key: 'lipa', label: 'Lipa Campus' }],
    referrals: { forecast: { forecast: null } },
  };
  const html = renderToStaticMarkup(React.createElement(FacilitatorStaffingView, { report, workloadRows: [] }));
  assert.ok(html.includes('Synthetic showcase data'));
  assert.ok(html.includes('Recommended facilitators'));
  assert.ok(html.includes('Lipa Campus'));
  assert.ok(!html.includes('Insufficient forecast or facilitator data'));
});

test('statistics opens on Overview and keeps the existing analytics tabs', async () => {
  const fixture = url(`import React from ${JSON.stringify(import.meta.resolve('react'))};
    export const useAuth = () => ({ user: { uid: 'admin', role: 'super_admin' } });
    export const StatisticsPanel = ({view}) => React.createElement('div', { 'data-view': view });`);
  const page = url(compile(await readFile(new URL('../src/pages/admin/AdminStatisticsPage.tsx', import.meta.url), 'utf8'))
    .replaceAll("'../../hooks/useAuth'", JSON.stringify(fixture))
    .replaceAll("'../../components/statistics/StatisticsPanel'", JSON.stringify(fixture)));
  const { AdminStatisticsPage } = await import(page);
  const html = renderToStaticMarkup(React.createElement(AdminStatisticsPage));
  assert.ok(html.includes('data-view="overview"'));
  assert.ok(html.includes('aria-selected="true" aria-controls="statistics-panel-overview"'));
  for (const label of ['Referral Analytics', 'Referral Forecast', 'Facilitator Staffing', 'Participation', 'Trends', 'Assessment Scores']) assert.ok(html.includes(label));
});

test('extended comparison shows candidate selection, sparse validation warning and retrospective limitations', () => {
  const start = Date.UTC(2026, 5, 29);
  const weeks = Array.from({ length: 16 }, (_, i) => ({ weekStart: new Date(start + i * 7 * 86400000).toISOString().slice(0, 10), requests: i === 0 ? 5 : 0 }));
  const html = renderToStaticMarkup(React.createElement(ReferralForecastView, { forecast: evaluateReferralForecast(weeks) }));
  for (const text of ['Poisson count regression', 'Fitted exponential smoothing', 'Always zero (sparsity check)',
    'Validation MAE', 'Active-week MAE', 'selected on validation', 'All validation weeks have zero stored requests',
    'exploratory, not a fresh independent test']) assert.ok(html.includes(text), text);
});
