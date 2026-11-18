import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSuppressionPass, type PassCell, type PassRelation } from './suppressionPass';

const cell = (id: string, value: number, aggregate = false): PassCell => ({ id, value, aggregate });

test('hidden cells whose visible sum is exactly 5 need no extra suppression', () => {
  const cells = [cell('A', 8), cell('B', 12), cell('D', 2), cell('E', 3), cell('T', 25, true)];
  const relations: PassRelation[] = [{ id: 'r', total: 'T', parts: ['A', 'B', 'D', 'E'] }];
  const r = runSuppressionPass(cells, relations);
  assert.deepEqual(r.secondarilyHidden, []);
  assert.equal(r.states.T, 'exact');
  assert.equal(r.states.D, 'fewerThan5');
  assert.equal(r.report.ok, true);
});

test('one hidden campus is recoverable from the institution total, so the total is withheld', () => {
  const cells = [cell('A', 8), cell('B', 12), cell('C', 7), cell('D', 2), cell('I', 29, true)];
  const r = runSuppressionPass(cells, [{ id: 'r', total: 'I', parts: ['A', 'B', 'C', 'D'] }]);
  assert.deepEqual(r.secondarilyHidden, ['I']);
  assert.equal(r.states.I, 'notShown');
  assert.equal(r.states.D, 'fewerThan5');
  assert.equal(r.report.ok, true);
});

test('two hidden cells with visible sum 2 are exposed, so the total is withheld', () => {
  const cells = [cell('A', 8), cell('B', 12), cell('D', 1), cell('E', 1), cell('T', 22, true)];
  const r = runSuppressionPass(cells, [{ id: 'r', total: 'T', parts: ['A', 'B', 'D', 'E'] }]);
  assert.deepEqual(r.secondarilyHidden, ['T']);
  assert.equal(r.report.ok, true);
});

test('a total that is itself 1..4 is shown as Not shown when its parts would reveal it', () => {
  const cells = [cell('a', 1), cell('b', 2), cell('T', 3, true)];
  const r = runSuppressionPass(cells, [{ id: 'r', total: 'T', parts: ['a', 'b'] }]);
  assert.equal(r.states.T, 'notShown');
  assert.equal(r.report.ok, true);
});

test('two relations sharing a withheld total still force an ordinary cell to be withheld', () => {
  // a + p = T and c + q = T with a, c hidden: even without T, a = c + 1.
  const cells = [cell('a', 4), cell('c', 3), cell('p', 6), cell('q', 7), cell('T', 10, true)];
  const relations: PassRelation[] = [
    { id: 'r1', total: 'T', parts: ['a', 'p'] },
    { id: 'r2', total: 'T', parts: ['c', 'q'] },
  ];
  const r = runSuppressionPass(cells, relations);
  assert.equal(r.report.ok, true);
  assert.equal(r.states.T, 'notShown');
  assert.equal(r.states.p, 'notShown'); // smallest exact non-aggregate value
  assert.equal(r.states.q, 'exact');
  assert.equal(r.states.a, 'fewerThan5');
  assert.equal(r.states.c, 'fewerThan5');
});

test('oversized groups fail closed and are resolved by withholding the total', () => {
  const parts = Array.from({ length: 14 }, (_, i) => cell(`p${i}`, 1));
  const cells = [...parts, cell('T', 14, true)];
  const r = runSuppressionPass(cells, [{ id: 'r', total: 'T', parts: parts.map((p) => p.id) }]);
  assert.equal(r.states.T, 'notShown');
  assert.equal(r.report.ok, true);
});

test('output is deterministic', () => {
  const cells = [cell('a', 4), cell('c', 3), cell('p', 6), cell('q', 7), cell('T', 10, true)];
  const relations: PassRelation[] = [
    { id: 'r1', total: 'T', parts: ['a', 'p'] },
    { id: 'r2', total: 'T', parts: ['c', 'q'] },
  ];
  assert.deepEqual(runSuppressionPass(cells, relations).states, runSuppressionPass(cells, relations).states);
});

test('input validation', () => {
  assert.throws(() => runSuppressionPass([cell('a', 1), cell('T', 5)], [{ id: 'r', total: 'T', parts: ['a'] }]));
  assert.throws(() => runSuppressionPass([cell('a', 1), cell('a', 2)], []));
  assert.throws(() => runSuppressionPass([cell('T', 1)], [{ id: 'r', total: 'T', parts: ['x'] }]));
});
