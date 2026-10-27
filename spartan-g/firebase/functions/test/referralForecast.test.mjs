import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitReferralRidge, predictReferralCount, evaluateReferralForecast, buildStatistics, fitReferralPoisson, predictReferralPoisson, fitReferralSmoothing } from './helpers/statisticsModules.mjs';

const series = counts => counts.map((requests, i) => ({ weekStart: new Date(Date.UTC(2026, 5, 29 + i * 7)).toISOString().slice(0, 10), requests }));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('Poisson constant-target MLE is its mean and zero-only data has the exact boundary solution', () => {
  const model = fitReferralPoisson([[0, 0], [1, 1], [2, 2]], [3, 3, 3]);
  assert.equal(model.converged, true);
  near(predictReferralPoisson(model, [1, 1]), 3);
  near(model.coefficients[0], 0);
  const zero = fitReferralPoisson([[0, 0], [0, 0]], [0, 0]);
  assert.equal(zero.zeroOnly, true); near(predictReferralPoisson(zero, [5, 5]), 0);
  assert.throws(() => fitReferralPoisson([[1, 2]], [-1]));
});

test('Poisson Newton solution satisfies independently computed penalized likelihood score equations', () => {
  const x = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 2]], y = [0, 2, 3, 6, 10];
  const model = fitReferralPoisson(x, y);
  assert.equal(model.converged, true);
  const residuals = x.map((row, i) => predictReferralPoisson(model, row) - y[i]);
  assert.ok(Math.abs(residuals.reduce((s, v) => s + v, 0) / x.length) < 1e-6);
  for (let j = 0; j < 2; j++) {
    const score = x.reduce((sum, row, i) => sum + (row[j] - model.featureMeans[j]) / model.featureScales[j] * residuals[i] / x.length, 0)
      + model.coefficients[j] * model.featureScales[j];
    assert.ok(Math.abs(score) < 1e-6, `penalized score ${j}: ${score}`);
  }
});

test('smoothing fits alpha on training history and returns a finite nonnegative estimate', () => {
  const counts = [1, 4, 2, 7, 3, 9, 5];
  const result = fitReferralSmoothing(counts);
  const score = alpha => { let level = counts[0], error = 0;
    for (const value of counts.slice(1)) { error += (value - level) ** 2; level = alpha * value + (1 - alpha) * level; }
    return { error, level };
  };
  for (const alpha of [.1, .3, .5, .7, .9]) assert.ok(score(result.alpha).error <= score(alpha).error + 1e-10);
  near(result.level, score(result.alpha).level);
  near(fitReferralSmoothing([3, 3, 3]).level, 3);
});

test('all candidates use the same later weeks and model-class selection cannot inspect them', () => {
  const weeks = series([3, 16, 3, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 1, 3]);
  const study = evaluateReferralForecast(weeks).comparisonStudy;
  assert.equal(study.status, 'ready');
  assert.equal(study.candidates.length, 6);
  assert.equal(study.validationWeeks, 4); assert.equal(study.testWeeks, 4);
  assert.equal(study.validationActiveWeeks, 0);
  assert.ok(study.validationEnd < study.testStart);
  assert.ok(study.candidates.find(c => c.id === study.selectedId).learned);
  for (const candidate of study.candidates) {
    assert.equal(candidate.unavailable, null);
    const predicted = study.predictions.map(row => row.forecasts[candidate.id]);
    near(candidate.test.mae, predicted.reduce((sum, value, i) => sum + Math.abs(value - study.predictions[i].actual), 0) / study.testWeeks);
  }
  const changed = structuredClone(weeks); changed.at(-1).requests = 10000;
  const altered = evaluateReferralForecast(changed).comparisonStudy;
  assert.equal(altered.selectedId, study.selectedId);
  assert.deepEqual(altered.candidates.map(c => c.validation), study.candidates.map(c => c.validation));
  assert.deepEqual(altered.predictions.slice(0, -1), study.predictions.slice(0, -1));
  assert.deepEqual(altered.predictions.at(-1).forecasts, study.predictions.at(-1).forecasts);
  assert.equal(study.testActiveWeeks, 2);
});

test('zero-heavy diagnostics do not divide by zero or disguise an always-zero benchmark', () => {
  const study = evaluateReferralForecast(series(Array(16).fill(0))).comparisonStudy;
  assert.equal(study.testActiveWeeks, 0);
  assert.equal(study.testZeroWeeks, 4);
  for (const candidate of study.candidates) { assert.equal(candidate.test.activeWeekMAE, null); near(candidate.test.mae, 0); }
  assert.equal(evaluateReferralForecast(series(Array(12).fill(1))).comparisonStudy.status, 'insufficient');
});

test('ridge fit matches an independently solved standardized one-feature example', () => {
  // x=[0,1,2], y=[1,3,5]: standardized X'X=3, alpha=1, raw slope=1.5, intercept=1.5.
  const model = fitReferralRidge([[0, 0], [1, 0], [2, 0]], [1, 3, 5]);
  near(model.coefficients[0], 1.5); near(model.coefficients[1], 0); near(model.intercept, 1.5);
  near(predictReferralCount(model, [2, 0]), 4.5);
  // Orthogonal standardized columns have X'X=4I; alpha=1 shrinks slopes by 4/5.
  const twoFeatures = fitReferralRidge([[-1, -1], [-1, 1], [1, -1], [1, 1]], [-3, 5, 1, 9]);
  near(twoFeatures.intercept, 3); near(twoFeatures.coefficients[0], 1.6); near(twoFeatures.coefficients[1], 3.2);
  assert.throws(() => fitReferralRidge([[1]], [1]));
  assert.throws(() => fitReferralRidge([[1, NaN]], [1]));
});

test('learns changing coefficients from outcomes and handles collinear or constant features', () => {
  const x = [[0, 0], [1, 1], [2, 2], [3, 3]];
  const a = fitReferralRidge(x, [1, 2, 3, 4]), b = fitReferralRidge(x, [2, 4, 6, 8]);
  near(b.coefficients[0], 2 * a.coefficients[0]);
  const constant = fitReferralRidge([[0, 0], [0, 0]], [3, 3]);
  near(predictReferralCount(constant, [0, 0]), 3);
  near(predictReferralCount({ ...a, intercept: -100 }, [0, 0]), 0);
});

test('chronological evaluation has no future leakage, including training feature scaling', () => {
  const weeks = series(Array.from({ length: 20 }, (_, i) => i + 1));
  const initial = evaluateReferralForecast(weeks);
  const changed = structuredClone(weeks); changed.at(-1).requests = 10000;
  const altered = evaluateReferralForecast(changed);
  assert.equal(initial.status, 'ready');
  assert.deepEqual(initial.evaluation.slice(0, -1), altered.evaluation.slice(0, -1));
  near(initial.evaluation.at(-1).predicted, altered.evaluation.at(-1).predicted);
  for (const row of initial.evaluation) assert.ok(row.trainedThrough < row.weekStart);
  near(initial.metrics.modelMAE, initial.evaluation.reduce((sum, row) => sum + Math.abs(row.predicted - row.actual), 0) / initial.metrics.testWeeks);
  near(initial.metrics.modelRMSE, Math.sqrt(initial.evaluation.reduce((sum, row) => sum + (row.predicted - row.actual) ** 2, 0) / initial.metrics.testWeeks));
  assert.equal(initial.metrics.comparison, 'model-better');
  assert.notDeepEqual(initial.model, altered.model, 'the final refit does use the now-observed final outcome');
});

test('baseline wins are retained and all-zero history is a tie, not a claim of accuracy', () => {
  const result = evaluateReferralForecast(series([10, 10, 10, 10, 10, 10, 0, 0, 0, 0, 0, 0]));
  assert.equal(result.metrics.baselineMAE, 0);
  assert.equal(result.metrics.comparison, 'baseline-better');
  const zero = evaluateReferralForecast(series(Array(12).fill(0)));
  assert.equal(zero.metrics.comparison, 'tie');
  assert.equal(zero.metrics.modelRMSE, 0);
  assert.equal(zero.dataKind, 'development');
});

test('short, malformed and discontinuous history never emits a trained model or invented metrics', () => {
  const short = evaluateReferralForecast(series([1, 2]));
  assert.equal(short.status, 'insufficient'); assert.equal(short.metrics, null); assert.equal(short.forecast, null);
  for (const counts of [[-1], [1.5], [NaN]]) assert.equal(evaluateReferralForecast(series(counts)).status, 'invalid');
  const duplicate = series(Array(12).fill(2)); duplicate[4].weekStart = duplicate[3].weekStart;
  assert.equal(evaluateReferralForecast(duplicate).status, 'invalid');
  const gap = series(Array(12).fill(2)); gap.splice(5, 1);
  assert.equal(evaluateReferralForecast(gap).status, 'invalid');
  assert.equal(evaluateReferralForecast(series(Array(12).fill(2)), 'Dates need correction').metrics, null);
});

test('dashboard training excludes partial and first-observed weeks and does not change with chart interval', () => {
  const counts = [2, 3, 16, 3, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 1, 3, 50];
  const weeks = series(counts);
  const appointments = weeks.flatMap((week, i) => Array.from({ length: week.requests }, (_, j) => ({
    id: `w${i}-${j}`, studentId: 's', createdAt: `${week.weekStart}T12:00:00+08:00`, status: 'requested',
  })));
  const input = { users: [], campuses: [], appointments, messages: [], conversations: [], links: [], attempts: [], definitions: [], legacyInstances: [] };
  const filters = { startDate: '2026-06-29', endDate: '2026-10-27', campus: '', assessmentId: '', interval: 'weekly' };
  const now = new Date('2026-10-27T15:00:00+08:00');
  const result = buildStatistics(input, filters, now).referrals.forecast;
  assert.equal(result.trainingStart, '2026-07-06');
  assert.equal(result.trainingEnd, '2026-10-19');
  assert.equal(result.weeks, 16);
  assert.equal(result.forecast.weekStart, '2026-10-26');
  assert.equal(result.forecast.weekEnd, '2026-11-01');
  assert.deepEqual(buildStatistics(input, { ...filters, interval: 'monthly' }, now).referrals.forecast, result);
  const changedPartial = structuredClone(input); changedPartial.appointments.push({ id: 'later', createdAt: '2026-10-27T13:00:00+08:00' });
  assert.deepEqual(buildStatistics(changedPartial, filters, now).referrals.forecast, result);
  const unknownCampus = buildStatistics(input, { ...filters, campus: '__unknown__' }, now).referrals.forecast;
  assert.deepEqual(unknownCampus, result);
  assert.equal(buildStatistics(input, { ...filters, campus: 'lipa' }, now).referrals.forecast.status, 'insufficient');
});
