import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDemand,
  classifyPositive,
  guaranteedLowDenominator,
  type DemandConfig,
  type PositiveConfig,
} from './bandClassifier';
import { classifySuppression, feasibleNumeratorInterval } from './feasibleInterval';

const weekly: DemandConfig = { minimumDenominator: 20, colorMinimum: 30, lowMaximum: 0.1, moderateMaximum: 0.25 };
const monthly: DemandConfig = { minimumDenominator: 20, colorMinimum: 30, lowMaximum: 0.25, moderateMaximum: 0.75 };
const participation: PositiveConfig = { minimumDenominator: 20, colorMinimum: 30, limitedMaximum: 0.3, moderateMaximum: 0.6 };
const completion: PositiveConfig = { minimumDenominator: 10, colorMinimum: 20, limitedMaximum: 0.4, moderateMaximum: 0.7 };

const exact = (value: number) => ({ kind: 'exact' as const, value });
const SUP = { kind: 'suppressed' as const };
const CSUP = { kind: 'complementSuppressed' as const };

test('classifySuppression: 0 and >=5 are exact, 1..4 suppressed, complement 1..4 flagged', () => {
  assert.deepEqual(classifySuppression(0, 40), { kind: 'exact', value: 0 });
  for (const v of [1, 2, 3, 4]) assert.deepEqual(classifySuppression(v, 40), { kind: 'suppressed' });
  assert.deepEqual(classifySuppression(5, 40), { kind: 'exact', value: 5 });
  for (const v of [36, 37, 38, 39]) assert.deepEqual(classifySuppression(v, 40), { kind: 'complementSuppressed' });
  assert.deepEqual(classifySuppression(35, 40), { kind: 'exact', value: 35 });
  assert.deepEqual(classifySuppression(40, 40), { kind: 'exact', value: 40 });
  assert.throws(() => classifySuppression(41, 40));
  assert.deepEqual(classifySuppression(50, 30, { proportion: false }), { kind: 'exact', value: 50 });
});

test('feasible intervals', () => {
  assert.deepEqual(feasibleNumeratorInterval(SUP, 40), { lo: 1, hi: 4 });
  assert.deepEqual(feasibleNumeratorInterval(CSUP, 30), { lo: 26, hi: 29 });
  assert.deepEqual(feasibleNumeratorInterval(exact(7), 30), { lo: 7, hi: 7 });
  assert.equal(feasibleNumeratorInterval(exact(31), 30), null);
  assert.equal(feasibleNumeratorInterval(CSUP, 30, { proportion: false }), null);
});

test('guaranteedLowDenominator = max(min, ceil(4 / lowMax)), inclusive', () => {
  assert.equal(guaranteedLowDenominator(0.1, 20), 40);
  assert.equal(guaranteedLowDenominator(0.25, 20), 20);
  assert.equal(guaranteedLowDenominator(0.3, 20), 20);
  assert.equal(guaranteedLowDenominator(0.2, 20), 20);
  assert.equal(guaranteedLowDenominator(0.05, 20), 80);
});

test('suppressed demand: Low only when 4/D is inside Low (0.10 boundary inclusive)', () => {
  assert.equal(classifyDemand(SUP, 40, weekly).band, 'Low');
  const d39 = classifyDemand(SUP, 39, weekly);
  assert.equal(d39.band, 'Insufficient data');
  assert.equal(d39.reason, 'ambiguous');
  assert.equal(classifyDemand(SUP, 19, weekly).reason, 'denominator');
  assert.equal(classifyDemand(SUP, 25, weekly, { proportion: false }).reason, 'ambiguous');
});

test('suppressed demand with monthly cutoff and low-confidence marker', () => {
  const d20 = classifyDemand(SUP, 20, monthly);
  assert.equal(d20.band, 'Low');
  assert.equal(d20.lowConfidence, true); // 20..29
  assert.equal(classifyDemand(SUP, 29, monthly).lowConfidence, true);
  assert.equal(classifyDemand(SUP, 30, monthly).lowConfidence, false);
});

test('confirmed zero is Low, not Insufficient data', () => {
  assert.equal(classifyDemand(exact(0), 20, weekly).band, 'Low');
});

test('demand boundaries are inclusive on the upper side', () => {
  assert.equal(classifyDemand(exact(10), 100, weekly).band, 'Low');
  assert.equal(classifyDemand(exact(11), 100, weekly).band, 'Moderate');
  assert.equal(classifyDemand(exact(25), 100, weekly).band, 'Moderate');
  assert.equal(classifyDemand(exact(26), 100, weekly).band, 'High');
  assert.equal(classifyDemand(exact(25), 100, monthly).band, 'Low'); // same ratio, monthly cutoff
  assert.equal(classifyDemand(exact(40), 400, weekly).band, 'Low'); // 40/400 == 0.10
  assert.equal(classifyDemand(exact(30), 120, weekly).band, 'Moderate'); // 30/120 == 0.25
});

test('positive boundaries are inclusive on the upper side (0.30 -> Limited, 0.70 -> Moderate)', () => {
  assert.equal(classifyPositive(exact(30), 100, participation).band, 'Limited');
  assert.equal(classifyPositive(exact(31), 100, participation).band, 'Moderate');
  assert.equal(classifyPositive(exact(60), 100, participation).band, 'Moderate');
  assert.equal(classifyPositive(exact(61), 100, participation).band, 'Adequate');
  assert.equal(classifyPositive(exact(70), 100, completion).band, 'Moderate');
  assert.equal(classifyPositive(exact(71), 100, completion).band, 'Adequate');
});

test('floating-point-sensitive ratios land on the right side', () => {
  assert.equal(classifyDemand(exact(3), 30, weekly).band, 'Low'); // 3/30
  assert.equal(classifyDemand(exact(7), 70, weekly).band, 'Low'); // 7/70
  assert.equal(classifyPositive(exact(18), 60, participation).band, 'Limited'); // 0.3
  assert.equal(classifyPositive(exact(14), 20, completion).band, 'Moderate'); // 0.7
  assert.equal(classifyPositive(exact(700), 1000, completion).band, 'Moderate');
});

test('complement-suppressed positive metrics use the lower bound', () => {
  assert.equal(classifyPositive(CSUP, 30, participation).band, 'Adequate'); // 26..29 of 30
  assert.equal(classifyPositive(CSUP, 25, completion).band, 'Adequate'); // 21..24 of 25
  const amb = classifyPositive(CSUP, 10, completion); // 6..9 of 10 straddles 0.70
  assert.equal(amb.band, 'Insufficient data');
  assert.equal(amb.reason, 'ambiguous');
});

test('suppressed numerator on a positive metric', () => {
  assert.equal(classifyPositive(SUP, 30, participation).band, 'Limited'); // <= 4/30
  const c12 = classifyPositive(SUP, 12, completion); // 4/12 = 0.33 <= 0.40
  assert.equal(c12.band, 'Limited');
  assert.equal(c12.lowConfidence, true);
  assert.equal(classifyPositive(SUP, 9, completion).reason, 'denominator');
});

test('invariant: numerator above denominator is unavailable; event counts are exempt', () => {
  const bad = classifyPositive(exact(31), 30, participation);
  assert.equal(bad.band, 'Insufficient data');
  assert.equal(bad.reason, 'invariant');
  assert.equal(classifyDemand(exact(50), 30, monthly, { proportion: false }).band, 'High'); // 1.67/student
  assert.equal(classifyDemand(CSUP, 30, monthly, { proportion: false }).reason, 'invariant');
});

test('unknown input is Insufficient data', () => {
  assert.equal(classifyDemand({ kind: 'unknown' }, 40, weekly).reason, 'unknown');
});

test('config guards', () => {
  assert.throws(() => classifyDemand(exact(1), 40, { ...weekly, minimumDenominator: 3 }));
  assert.throws(() => classifyDemand(exact(1), 40, { ...weekly, lowMaximum: 0.3 }));
  assert.throws(() => classifyDemand(exact(1), 40, { ...weekly, colorMinimum: 10 }));
});
