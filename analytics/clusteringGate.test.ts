import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateClusteringGate, leaveOneCampusOutStable } from './clusteringGate';

test('clustering stays disabled until locked, complete, denominated observations reach both gates', () => {
  const rows = Array.from({ length: 29 }, (_, index) => ({
    campusKey: ['lipa', 'alangilan', 'malvar', 'nasugbu'][index % 4],
    periodStartDate: `2026-${String(index % 12 + 1).padStart(2, '0')}-01`,
    locked: true,
    complete: true,
    denominated: true,
    features: [index % 5, index % 3],
    dataPhase: 'real_pilot',
    cutoffApproved: true,
  }));
  assert.equal(evaluateClusteringGate(rows).enabled, false);
  rows.push({
    campusKey: 'pablo_borbon',
    periodStartDate: '2026-11-01',
    locked: true,
    complete: true,
    denominated: true,
    features: [4, 2],
    dataPhase: 'real_pilot',
    cutoffApproved: true,
  });
  assert.equal(evaluateClusteringGate(rows).enabled, true);
  assert.equal(evaluateClusteringGate(rows.map(row => ({ ...row, locked: false }))).enabled, false);
  assert.equal(evaluateClusteringGate(rows.map(row => ({ ...row, cutoffApproved: false }))).enabled, false);
});

test('leave-one-campus-out stability requires every campus to participate', () => {
  const rows = ['lipa', 'alangilan', 'malvar', 'nasugbu'].map(campus => ({
    campusKey: campus,
    periodStartDate: '2026-11-01',
    locked: true,
    complete: true,
    denominated: true,
    features: [1, 1],
  }));
  assert.equal(leaveOneCampusOutStable(['lipa', 'alangilan', 'malvar', 'nasugbu'], rows).stable, true);
  assert.equal(leaveOneCampusOutStable(['lipa', 'alangilan'], rows).stable, false);
});
