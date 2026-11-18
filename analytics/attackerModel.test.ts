import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLeaks, predicate, solveFeasibleSets, sumEquals } from './attackerModel';

const cells = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));

test('two hidden cells: only a visible sum of exactly 5 keeps every cell at {1,2,3,4}', () => {
  for (const total of [2, 3, 4, 5, 6, 7, 8]) {
    const report = findLeaks({
      variables: cells(2),
      constraints: [sumEquals('total', ['c0', 'c1'], 0, total)],
    });
    assert.equal(report.ok, total === 5, `visible sum ${total}`);
  }
});

test('known leak shapes: sum 2 -> {1}, sum 3 -> {1,2}, sum 8 -> {4}', () => {
  const feasible = (total: number) =>
    solveFeasibleSets({ variables: cells(2), constraints: [sumEquals('t', ['c0', 'c1'], 0, total)] }).feasible;
  assert.deepEqual(feasible(2).c0, [1]);
  assert.deepEqual(feasible(3).c0, [1, 2]);
  assert.deepEqual(feasible(8).c0, [4]);
});

test('single hidden campus recovered by subtraction (visible 8+12+5, published total 27)', () => {
  const report = findLeaks({
    variables: cells(1),
    constraints: [sumEquals('institution total', ['c0'], 8 + 12 + 5, 27)],
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.leaks, [{ variable: 'c0', feasible: [2] }]);
});

test('contradictory published values are reported as inconsistent', () => {
  const report = findLeaks({
    variables: cells(1),
    constraints: [sumEquals('total', ['c0'], 8 + 12 + 7, 27)], // would force hidden = 0
  });
  assert.equal(report.inconsistent, true);
  assert.equal(report.ok, false);
});

test('derived label leaks: "Stable" (+/-5 points) next to an exact prior period of 6/40 pins the hidden count', () => {
  const report = findLeaks({
    variables: cells(1),
    constraints: [predicate('recent change is Stable', ['c0'], (v) => Math.abs((v.c0 as number) - 6) * 100 <= 5 * 40)],
  });
  assert.deepEqual(report.leaks, [{ variable: 'c0', feasible: [4] }]);
});

test('unconstrained and independent cells are safe', () => {
  const report = findLeaks({
    variables: cells(3),
    constraints: [sumEquals('pair', ['c0', 'c1'], 0, 5)],
  });
  assert.equal(report.ok, true);
});

test('oversized components fail closed', () => {
  const ids = cells(13).map((c) => c.id);
  const report = findLeaks({ variables: cells(13), constraints: [sumEquals('big', ids, 0, 30)] });
  assert.equal(report.ok, false);
  assert.equal(report.oversized.length, 1);
});

test('unknown variable in a constraint throws', () => {
  assert.throws(() => solveFeasibleSets({ variables: cells(1), constraints: [sumEquals('x', ['nope'], 0, 1)] }));
});
