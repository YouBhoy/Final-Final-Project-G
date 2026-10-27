/** Small, dependency-free ridge regression prototype. No database access or clinical decisions. */
export interface ReferralWeek { weekStart: string; requests: number }
export interface ReferralRidgeModel {
  version: 'referral-ridge-v1'; alpha: number; intercept: number; coefficients: number[];
  featureMeans: number[]; featureScales: number[]; trainingRows: number;
}
export interface ReferralForecast {
  comparisonStudy: ReferralComparison;
  status: 'ready' | 'insufficient' | 'invalid';
  dataKind: 'development'; message: string; weeks: number; requiredWeeks: number;
  trainingStart: string | null; trainingEnd: string | null;
  model: ReferralRidgeModel | null;
  metrics: { modelMAE: number; modelRMSE: number; baselineMAE: number; baselineRMSE: number;
    comparison: 'model-better' | 'baseline-better' | 'tie'; testWeeks: number; initialTrainingRows: number } | null;
  evaluation: { weekStart: string; actual: number; predicted: number; baseline: number; trainedThrough: string }[];
  forecast: { weekStart: string; weekEnd: string; requests: number } | null;
}
export interface ForecastErrors { mae: number; rmse: number; bias: number; activeWeekMAE: number | null }
export interface ReferralComparison {
  status: 'ready' | 'insufficient'; requiredWeeks: number;
  validationStart: string | null; validationEnd: string | null; validationWeeks: number;
  validationActiveWeeks: number;
  testStart: string | null; testEnd: string | null; testWeeks: number;
  testActiveWeeks: number; testZeroWeeks: number;
  selectedId: string | null; selectedLabel: string | null; selectedEstimate: number | null;
  observedRequests: number; zeroWeeks: number; activeWeeks: number;
  candidates: { id: string; label: string; learned: boolean; validation: ForecastErrors | null; test: ForecastErrors | null; nextEstimate: number | null; unavailable: string | null }[];
  predictions: { weekStart: string; actual: number; forecasts: Record<string, number> }[];
}
export interface ReferralPoissonModel {
  intercept: number; coefficients: number[]; featureMeans: number[]; featureScales: number[];
  zeroOnly: boolean; converged: boolean; iterations: number;
}
const WEEK = 7 * 86400000;
const ALPHA = 1; // Prespecified, not tuned on held-out outcomes.
export const MIN_REFERRAL_FORECAST_WEEKS = 11; // 2 lags + at least 6 fitting rows + 3 test weeks.

/** Standardize using fitting rows only; solve the two-feature ridge normal equations. */
export function fitReferralRidge(x: number[][], y: number[]): ReferralRidgeModel {
  if (!x.length || x.length !== y.length || x.some(row => row.length !== 2 || row.some(v => !Number.isFinite(v)))
    || y.some(v => !Number.isFinite(v))) throw new Error('Ridge requires finite two-feature rows and matching targets.');
  const means = [0, 1].map(j => x.reduce((sum, row) => sum + row[j], 0) / x.length);
  const scales = [0, 1].map(j => Math.sqrt(x.reduce((sum, row) => sum + (row[j] - means[j]) ** 2, 0) / x.length) || 1);
  const targetMean = y.reduce((sum, value) => sum + value, 0) / y.length;
  let a = ALPHA, b = 0, d = ALPHA, u = 0, v = 0;
  x.forEach((row, i) => {
    const z0 = (row[0] - means[0]) / scales[0], z1 = (row[1] - means[1]) / scales[1];
    a += z0 * z0; b += z0 * z1; d += z1 * z1;
    u += z0 * (y[i] - targetMean); v += z1 * (y[i] - targetMean);
  });
  const determinant = a * d - b * b;
  const coefficients = [(d * u - b * v) / determinant / scales[0], (a * v - b * u) / determinant / scales[1]];
  const intercept = targetMean - coefficients.reduce((sum, coefficient, j) => sum + coefficient * means[j], 0);
  if (![intercept, ...coefficients].every(Number.isFinite)) throw new Error('Ridge fit is not finite.');
  return { version: 'referral-ridge-v1', alpha: ALPHA, intercept, coefficients,
    featureMeans: means, featureScales: scales, trainingRows: x.length };
}
export function predictReferralCount(model: ReferralRidgeModel, features: number[]): number {
  if (features.length !== 2 || features.some(v => !Number.isFinite(v))) throw new Error('Prediction requires two finite lags.');
  // Count-domain postprocessing, not a hand-authored prediction rule. Keep fractions for error metrics.
  return Math.max(0, model.intercept + features.reduce((sum, value, j) => sum + value * model.coefficients[j], 0));
}
function weekTime(value: string): number {
  const time = Date.parse(`${value}T00:00:00+08:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(time)
    && new Date(time + 8 * 3600000).toISOString().slice(0, 10) === value
    && new Date(time + 8 * 3600000).getUTCDay() === 1 ? time : NaN;
}
const day = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 10);

/** Penalized Poisson log-link regression: mean(mu - y*eta) + .5*||slopes||^2.
 * Damped Newton optimization, intercept unpenalized; training-only standardization.
 */
export function fitReferralPoisson(x: number[][], y: number[]): ReferralPoissonModel {
  if (!x.length || x.length !== y.length || x.some(row => row.length !== 2 || row.some(v => !Number.isFinite(v)))
    || y.some(v => !Number.isFinite(v) || v < 0)) throw new Error('Poisson requires finite two-feature rows and nonnegative targets.');
  const means = [0, 1].map(j => x.reduce((s, row) => s + row[j], 0) / x.length);
  const scales = [0, 1].map(j => Math.sqrt(x.reduce((s, row) => s + (row[j] - means[j]) ** 2, 0) / x.length) || 1);
  const rows = x.map(row => [1, (row[0] - means[0]) / scales[0], (row[1] - means[1]) / scales[1]]);
  const mean = y.reduce((s, value) => s + value, 0) / y.length;
  if (mean === 0) return { intercept: 0, coefficients: [0, 0], featureMeans: means, featureScales: scales, zeroOnly: true, converged: true, iterations: 0 };
  let beta = [Math.log(mean), 0, 0], converged = false, iterations = 0;
  const objective = (parameters: number[]) => rows.reduce((sum, row, i) => {
    const eta = row.reduce((s, value, j) => s + value * parameters[j], 0);
    return sum + (Math.exp(eta) - y[i] * eta) / rows.length;
  }, .5 * (parameters[1] ** 2 + parameters[2] ** 2));
  for (iterations = 0; iterations < 60; iterations++) {
    const gradient = [0, beta[1], beta[2]];
    const h = [[0, 0, 0], [0, 1, 0], [0, 0, 1]];
    rows.forEach((row, i) => {
      const mu = Math.exp(row.reduce((s, value, j) => s + value * beta[j], 0));
      for (let j = 0; j < 3; j++) {
        gradient[j] += row[j] * (mu - y[i]) / rows.length;
        for (let k = 0; k < 3; k++) h[j][k] += row[j] * row[k] * mu / rows.length;
      }
    });
    if (Math.max(...gradient.map(Math.abs)) < 1e-7) { converged = true; break; }
    const matrix = h.map((row, j) => [...row, gradient[j]]);
    for (let j = 0; j < 3; j++) {
      let pivot = j;
      for (let k = j + 1; k < 3; k++) if (Math.abs(matrix[k][j]) > Math.abs(matrix[pivot][j])) pivot = k;
      [matrix[j], matrix[pivot]] = [matrix[pivot], matrix[j]];
      const diagonal = matrix[j][j];
      if (!Number.isFinite(diagonal) || Math.abs(diagonal) < 1e-14) throw new Error('Poisson fit has a singular Hessian.');
      for (let k = j; k < 4; k++) matrix[j][k] /= diagonal;
      for (let i = 0; i < 3; i++) if (i !== j) {
        const factor = matrix[i][j];
        for (let k = j; k < 4; k++) matrix[i][k] -= factor * matrix[j][k];
      }
    }
    const delta = matrix.map(row => row[3]), current = objective(beta);
    let accepted = false;
    for (let step = 1; step >= 1 / 1048576; step /= 2) {
      const proposal = beta.map((value, j) => value - step * delta[j]);
      const value = objective(proposal);
      if (Number.isFinite(value) && value <= current + 1e-12) { beta = proposal; accepted = true; break; }
    }
    if (!accepted) break;
  }
  const coefficients = [beta[1] / scales[0], beta[2] / scales[1]];
  const intercept = beta[0] - coefficients.reduce((sum, value, j) => sum + value * means[j], 0);
  return { intercept, coefficients, featureMeans: means, featureScales: scales, zeroOnly: false, converged, iterations };
}
export function predictReferralPoisson(model: ReferralPoissonModel, features: number[]): number {
  if (features.length !== 2 || features.some(v => !Number.isFinite(v))) throw new Error('Poisson prediction requires two finite lags.');
  const prediction = model.zeroOnly ? 0 : Math.exp(model.intercept + features.reduce((sum, value, j) => sum + value * model.coefficients[j], 0));
  if (!Number.isFinite(prediction)) throw new Error('Poisson prediction is not finite.');
  return prediction;
}
/** Alpha chosen by one-step squared errors on the fitting history only, never later outcomes. */
export function fitReferralSmoothing(counts: number[]): { alpha: number; level: number } {
  if (counts.length < 2 || counts.some(v => !Number.isFinite(v) || v < 0)) throw new Error('Smoothing needs at least two nonnegative observations.');
  let best = { alpha: .1, level: counts[0], error: Infinity };
  for (const alpha of [.1, .3, .5, .7, .9]) {
    let level = counts[0], error = 0;
    for (let i = 1; i < counts.length; i++) { error += (counts[i] - level) ** 2; level = alpha * counts[i] + (1 - alpha) * level; }
    if (error < best.error) best = { alpha, level, error };
  }
  return { alpha: best.alpha, level: best.level };
}
function forecastErrors(actual: number[], predicted: number[]): ForecastErrors {
  const residuals = predicted.map((value, i) => value - actual[i]);
  const active = residuals.filter((_, i) => actual[i] > 0);
  return { mae: residuals.reduce((s, v) => s + Math.abs(v), 0) / actual.length,
    rmse: Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / actual.length),
    bias: residuals.reduce((s, v) => s + v, 0) / actual.length,
    activeWeekMAE: active.length ? active.reduce((s, v) => s + Math.abs(v), 0) / active.length : null };
}
/** Model class selection uses only a validation prefix; later backtest outcomes cannot select it.
 * These are retrospective development experiments, not a fresh confirmatory test set.
 */
function compareReferralModels(weeks: ReferralWeek[]): ReferralComparison {
  const empty: ReferralComparison = { status: 'insufficient', requiredWeeks: 14, validationStart: null, validationEnd: null,
    validationWeeks: 0, validationActiveWeeks: 0, testStart: null, testEnd: null, testWeeks: 0, testActiveWeeks: 0, testZeroWeeks: 0, selectedId: null, selectedLabel: null, selectedEstimate: null,
    observedRequests: weeks.reduce((sum, week) => sum + week.requests, 0), zeroWeeks: weeks.filter(w => w.requests === 0).length,
    activeWeeks: weeks.filter(w => w.requests > 0).length, candidates: [], predictions: [] };
  if (weeks.length < 14) return empty;
  const counts = weeks.map(w => w.requests), testStart = weeks.length - Math.max(3, Math.ceil(weeks.length * .25));
  const validationStart = 8; // Six initial regression rows after the two lags.
  const definitions = [
    { id: 'ridge', label: 'Ridge regression', learned: true },
    { id: 'poisson', label: 'Poisson count regression', learned: true },
    { id: 'smoothing', label: 'Fitted exponential smoothing', learned: true },
    { id: 'last-week', label: 'Same as last week', learned: false },
    { id: 'mean', label: 'Historical mean', learned: false },
    { id: 'zero', label: 'Always zero (sparsity check)', learned: false },
  ];
  const predict = (id: string, end: number): number => {
    const history = counts.slice(0, end);
    if (id === 'last-week') return history[history.length - 1];
    if (id === 'zero') return 0;
    if (id === 'mean') return history.reduce((s, v) => s + v, 0) / history.length;
    if (id === 'smoothing') return fitReferralSmoothing(history).level;
    const x: number[][] = [], y: number[] = [];
    for (let i = 2; i < end; i++) { x.push([counts[i - 1], counts[i - 2]]); y.push(counts[i]); }
    const features = [counts[end - 1], counts[end - 2]];
    if (id === 'ridge') return predictReferralCount(fitReferralRidge(x, y), features);
    const model = fitReferralPoisson(x, y);
    if (!model.converged) throw new Error('Poisson optimization did not converge.');
    return predictReferralPoisson(model, features);
  };
  const candidates = definitions.map(definition => {
    try {
      const validation = Array.from({ length: testStart - validationStart }, (_, i) => predict(definition.id, validationStart + i));
      return { ...definition, validation: forecastErrors(counts.slice(validationStart, testStart), validation),
        test: null as ForecastErrors | null, nextEstimate: null as number | null, unavailable: null as string | null };
    } catch (error) { return { ...definition, validation: null, test: null, nextEstimate: null, unavailable: error instanceof Error ? error.message : 'Fit unavailable.' }; }
  });
  // Choose before computing any later backtest scores. Keep benchmarks out of learned selection.
  const chosen = candidates.filter(c => c.learned && c.validation).sort((a, b) => a.validation!.mae - b.validation!.mae
    || a.validation!.rmse - b.validation!.rmse)[0];
  const predictions = weeks.slice(testStart).map(week => ({ weekStart: week.weekStart, actual: week.requests, forecasts: {} as Record<string, number> }));
  for (const candidate of candidates) {
    if (!candidate.validation) continue;
    try {
      const values = predictions.map((_, i) => predict(candidate.id, testStart + i));
      candidate.test = forecastErrors(counts.slice(testStart), values);
      values.forEach((value, i) => { predictions[i].forecasts[candidate.id] = value; });
      candidate.nextEstimate = predict(candidate.id, counts.length);
    } catch (error) { candidate.unavailable = error instanceof Error ? error.message : 'Fit unavailable.'; }
  }
  return { ...empty, status: 'ready', validationStart: weeks[validationStart].weekStart,
    validationEnd: weeks[testStart - 1].weekStart, validationWeeks: testStart - validationStart,
    validationActiveWeeks: counts.slice(validationStart, testStart).filter(value => value > 0).length,
    testStart: weeks[testStart].weekStart, testEnd: weeks[weeks.length - 1].weekStart, testWeeks: predictions.length,
    testActiveWeeks: counts.slice(testStart).filter(value => value > 0).length,
    testZeroWeeks: counts.slice(testStart).filter(value => value === 0).length,
    selectedId: chosen?.id ?? null, selectedLabel: chosen?.label ?? null, selectedEstimate: chosen?.nextEstimate ?? null,
    candidates, predictions };
}

/** Expanding-window, one-week-ahead evaluation of the final 25% (at least 3 weeks).
 * Each scaler/fit sees only earlier outcomes. Then refit on all complete input weeks.
 * Input must contain complete, consecutive Monday weeks; provenance is development only.
 */
export function evaluateReferralForecast(weeks: ReferralWeek[], blockedReason?: string): ReferralForecast {
  const base: ReferralForecast = { status: 'insufficient', dataKind: 'development',
    message: 'Select at least 11 consecutive complete weeks for prototype fitting and testing.',
    weeks: weeks.length, requiredWeeks: MIN_REFERRAL_FORECAST_WEEKS, trainingStart: null, trainingEnd: null,
    model: null, metrics: null, evaluation: [], forecast: null, comparisonStudy: compareReferralModels([]) };
  if (blockedReason) return { ...base, status: 'invalid', message: blockedReason };
  if (weeks.some((week, i) => !Number.isFinite(weekTime(week.weekStart)) || !Number.isSafeInteger(week.requests)
    || week.requests < 0 || i > 0 && weekTime(week.weekStart) - weekTime(weeks[i - 1].weekStart) !== WEEK)) {
    return { ...base, status: 'invalid', message: 'Forecasting requires valid counts in complete, consecutive Monday weeks.' };
  }
  if (weeks.length < MIN_REFERRAL_FORECAST_WEEKS) return base;
  const counts = weeks.map(week => week.requests);
  const features = (i: number) => [counts[i - 1], counts[i - 2]];
  const fitThrough = (end: number) => {
    const x: number[][] = [], y: number[] = [];
    for (let i = 2; i < end; i++) { x.push(features(i)); y.push(counts[i]); }
    return fitReferralRidge(x, y);
  };
  const testWeeks = Math.max(3, Math.ceil(weeks.length * .25));
  const testStart = weeks.length - testWeeks;
  const evaluation: ReferralForecast['evaluation'] = [];
  for (let i = testStart; i < weeks.length; i++) {
    const model = fitThrough(i);
    evaluation.push({ weekStart: weeks[i].weekStart, actual: counts[i],
      predicted: predictReferralCount(model, features(i)), baseline: counts[i - 1], trainedThrough: weeks[i - 1].weekStart });
  }
  const errors = (key: 'predicted' | 'baseline') => {
    const residuals = evaluation.map(row => row[key] - row.actual);
    return { mae: residuals.reduce((sum, error) => sum + Math.abs(error), 0) / testWeeks,
      rmse: Math.sqrt(residuals.reduce((sum, error) => sum + error * error, 0) / testWeeks) };
  };
  const learned = errors('predicted'), baseline = errors('baseline');
  const model = fitThrough(weeks.length), next = weekTime(weeks[weeks.length - 1].weekStart) + WEEK;
  return { ...base, status: 'ready', message: 'Prototype evaluation on development/test data; real-world accuracy is unverified.',
    trainingStart: weeks[0].weekStart, trainingEnd: weeks[weeks.length - 1].weekStart, model, evaluation, comparisonStudy: compareReferralModels(weeks),
    metrics: { modelMAE: learned.mae, modelRMSE: learned.rmse, baselineMAE: baseline.mae, baselineRMSE: baseline.rmse,
      comparison: Math.abs(learned.mae - baseline.mae) < 1e-9 ? 'tie' : learned.mae < baseline.mae ? 'model-better' : 'baseline-better',
      testWeeks, initialTrainingRows: testStart - 2 },
    forecast: { weekStart: day(next), weekEnd: day(next + WEEK - 86400000), requests: predictReferralCount(model, features(weeks.length)) } };
}
