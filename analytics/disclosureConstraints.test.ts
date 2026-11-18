import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disclosureConstraints } from './disclosureConstraints';

test('converts documents and relations into disclosure pass inputs', () => {
  const input = disclosureConstraints([{
    id: 'lipa_monthly_2026-11',
    cells: {
      total: { kind: 'exact', value: 15 },
      a: { kind: 'exact', value: 12 },
      b: { kind: 'fewerThan5', value: null },
    },
    relations: [{ id: 'campus_total', total: 'total', parts: ['a', 'b'] }],
  }]);

  assert.equal(input.cells.length, 3);
  assert.equal(input.relations.length, 1);
  assert.equal(input.relations[0]?.total, 'lipa_monthly_2026-11.total');
});

test('rejects conflicting duplicate cells', () => {
  assert.throws(() => disclosureConstraints([
    { id: 'a', cells: { total: { kind: 'exact', value: 5 } } },
    { id: 'a', cells: { total: { kind: 'exact', value: 5 } } },
  ]));
});
