import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustedRandIndex, leaveOneCampusOutARI } from './clusteringStability';

test('ARI is 1 for identical partitions and below 1 for mismatches', () => {
  assert.equal(adjustedRandIndex([0, 0, 1, 1], [0, 0, 1, 1]), 1);
  assert.ok(adjustedRandIndex([0, 0, 1, 1], [0, 1, 0, 1]) < 1);
});

test('LOCO stability returns a score for every campus', () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({
    campusKey: ['lipa', 'alangilan', 'malvar', 'nasugbu'][index % 4],
    features: [index % 4 < 2 ? 0 : 10, index % 2],
  }));
  const result = leaveOneCampusOutARI(rows, 2);
  assert.equal(result.heldOutCampuses, 4);
  assert.equal(result.scores.length, 4);
  assert.ok(Number.isFinite(result.meanARI));
});
