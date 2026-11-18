export interface ClusterRow {
  campusKey: string;
  features: readonly number[];
}

function standardize(rows: readonly ClusterRow[], heldOut?: string) {
  const fitting = heldOut ? rows.filter(row => row.campusKey !== heldOut) : rows;
  const width = fitting[0]?.features.length ?? 0;
  const means = Array.from({ length: width }, (_, column) =>
    fitting.reduce((sum, row) => sum + row.features[column], 0) / Math.max(1, fitting.length));
  const scales = means.map((mean, column) =>
    Math.sqrt(fitting.reduce((sum, row) => sum + (row.features[column] - mean) ** 2, 0) / Math.max(1, fitting.length)) || 1);
  return { means, scales };
}

function kmeans(rows: readonly ClusterRow[], k: number, heldOut?: string) {
  const fitting = heldOut ? rows.filter(row => row.campusKey !== heldOut) : rows;
  if (fitting.length < k) throw new Error('Not enough fitting rows.');
  const { means, scales } = standardize(rows, heldOut);
  const points = fitting.map(row => row.features.map((value, column) => (value - means[column]) / scales[column]));
  const centroids = points.slice(0, k).map(point => [...point]);
  let assignments = Array(fitting.length).fill(0);
  for (let iteration = 0; iteration < 100; iteration++) {
    const next = points.map(point => {
      let best = 0;
      let bestDistance = Infinity;
      centroids.forEach((centroid, cluster) => {
        const distance = point.reduce((sum, value, column) => sum + (value - centroid[column]) ** 2, 0);
        if (distance < bestDistance) { best = cluster; bestDistance = distance; }
      });
      return best;
    });
    if (next.every((value, index) => value === assignments[index])) break;
    assignments = next;
    centroids.forEach((centroid, cluster) => {
      const members = points.filter((_, index) => assignments[index] === cluster);
      centroid.forEach((_, column) => {
        centroid[column] = members.length
          ? members.reduce((sum, point) => sum + point[column], 0) / members.length
          : 0;
      });
    });
  }
  return { centroids, assignments, fitting, means, scales };
}

function closest(point: readonly number[], centroids: readonly number[][]) {
  let best = 0;
  let bestDistance = Infinity;
  centroids.forEach((centroid, cluster) => {
    const distance = point.reduce((sum, value, column) => sum + (value - centroid[column]) ** 2, 0);
    if (distance < bestDistance) { best = cluster; bestDistance = distance; }
  });
  return best;
}

export function adjustedRandIndex(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length || !left.length) return 0;
  const n = left.length;
  const pairs = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const key = `${left[i]}|${right[j]}`;
      pairs.set(key, [(pairs.get(key)?.[0] ?? 0)]);
    }
  }
  const countPairs = (a: readonly number[], b: readonly number[]) => {
    const table = new Map<string, number>();
    a.forEach((value, i) => {
      const key = `${value}|${b[i]}`;
      table.set(key, (table.get(key) ?? 0) + 1);
    });
    return table;
  };
  const ab = countPairs(left, right);
  const ca = new Map<number, number>(), cb = new Map<number, number>();
  left.forEach(value => ca.set(value, (ca.get(value) ?? 0) + 1));
  right.forEach(value => cb.set(value, (cb.get(value) ?? 0) + 1));
  const choose2 = (value: number) => value * (value - 1) / 2;
  let sumAb = [...ab.values()].reduce((sum, value) => sum + choose2(value), 0);
  let sumA = [...ca.values()].reduce((sum, value) => sum + choose2(value), 0);
  let sumB = [...cb.values()].reduce((sum, value) => sum + choose2(value), 0);
  const total = choose2(n);
  const expected = sumA * sumB / total;
  const max = (sumA + sumB) / 2;
  return max === expected ? 1 : (sumAb - expected) / (max - expected);
}

export function leaveOneCampusOutARI(rows: readonly ClusterRow[], k: number) {
  const campusKeys = [...new Set(rows.map(row => row.campusKey))];
  if (campusKeys.length < 4) throw new Error('LOCO requires at least four campuses.');
  const full = kmeans(rows, k);
  const fullAssignments = full.assignments;
  const scores: number[] = [];
  for (const heldOut of campusKeys) {
    const model = kmeans(rows, k, heldOut);
    const originalRows = rows.filter(row => row.campusKey !== heldOut);
    const originalAssignments = originalRows.map(row =>
      fullAssignments[rows.findIndex(candidate => candidate === row)]);
    const heldOutAssignments = rows.filter(row => row.campusKey === heldOut).map(row => {
      const standardized = row.features.map((value, column) =>
        (value - model.means[column]) / model.scales[column]);
      return closest(standardized, model.centroids);
    });
    const predictions = [...originalRows, ...rows.filter(row => row.campusKey === heldOut)].map(row => {
      if (row.campusKey === heldOut) {
        const standardized = row.features.map((value, column) =>
          (value - model.means[column]) / model.scales[column]);
        return closest(standardized, model.centroids);
      }
      return fullAssignments[rows.findIndex(candidate => candidate === row)];
    });
    scores.push(adjustedRandIndex(
      [...originalAssignments, ...heldOutAssignments],
      predictions,
    ));
  }
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return { stable: mean >= 0.70, meanARI: mean, heldOutCampuses: campusKeys.length, scores };
}
