import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFile } from 'node:fs/promises';

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'spartan-g-a2d80';
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const rows = await db.collection('analytics/campusPeriods/records').get();
const usable = rows.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(row =>
  row.locked && row.isComplete && row.registeredStudentUsers?.suppressed === false
  && Number.isInteger(row.registeredStudentUsers?.value));

const campuses = new Set(usable.map(row => row.campusKey));
const enabled = usable.length >= 30 && campuses.size >= 4;
const campusCounts = [...campuses].map(campus => [
  campus,
  usable.filter(row => row.campusKey === campus).length,
]);
const largest = campusCounts.reduce((best, current) => current[1] > best[1] ? current : best, ['', 0]);
const identityDominant = largest[1] / usable.length >= 0.50;
const byCampus = new Map();
for (const row of usable) {
  const featureRow = [
    row.participationRateBand === 'Adequate' ? 1 :
      row.participationRateBand === 'Moderate' ? 0.5 : 0,
    row.appointmentDemandBand === 'High' ? 1 :
      row.appointmentDemandBand === 'Moderate' ? 0.5 : 0,
  ];
  const existing = byCampus.get(row.campusKey) ?? [];
  existing.push(featureRow);
  byCampus.set(row.campusKey, existing);
}
function distance(a, b) {
  return a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);
}
function fitKMeans(rows, k, heldOutCampus) {
  const fitting = heldOutCampus ? rows.filter(row => row.campusKey !== heldOutCampus) : rows;
  if (fitting.length < k) throw new Error('Insufficient rows for k-means stability.');
  const centroids = fitting.slice(0, k).map(row => [...row.features]);
  for (let iteration = 0; iteration < 100; iteration++) {
    const assignments = fitting.map(row => {
      let cluster = 0;
      let best = Infinity;
      centroids.forEach((centroid, index) => {
        const candidate = distance(row.features, centroid);
        if (candidate < best) { best = candidate; cluster = index; }
      });
      return cluster;
    });
    const next = centroids.map((_, cluster) => {
      const members = fitting.filter((row, index) => assignments[index] === cluster);
      if (!members.length) return centroids[cluster];
      return centroids[0].map((__, column) =>
        members.reduce((sum, row) => sum + row.features[column], 0) / members.length);
    });
    if (next.every((centroid, index) => distance(centroid, centroids[index]) < 1e-9)) {
      centroids.splice(0, centroids.length, ...next);
      return centroids;
    }
    centroids.splice(0, centroids.length, ...next);
  }
  return centroids;
}
function assign(row, centroids) {
  let cluster = 0;
  let best = Infinity;
  centroids.forEach((centroid, index) => {
    const candidate = distance(row.features, centroid);
    if (candidate < best) { best = candidate; cluster = index; }
  });
  return cluster;
}
const allFeatures = usable.map(row => ({
  campusKey: row.campusKey,
  features: [
    row.participationRateBand === 'Adequate' ? 1 :
      row.participationRateBand === 'Moderate' ? 0.5 : 0,
    row.appointmentDemandBand === 'High' ? 1 :
      row.appointmentDemandBand === 'Moderate' ? 0.5 : 0,
  ],
}));
const campusKeys = [...byCampus.keys()];
const locoScores = [];
for (const heldOut of campusKeys) {
  const centroids = fitKMeans(allFeatures, 2, heldOut);
  const predicted = allFeatures.map(row => assign(row, centroids));
  const fullCentroids = fitKMeans(allFeatures, 2);
  const reference = allFeatures.map(row => assign(row, fullCentroids));
  let agreements = 0;
  allFeatures.forEach((_, index) => {
    if (predicted[index] === reference[index]) agreements++;
  });
  locoScores.push(agreements / allFeatures.length);
}
const meanLOCOAgreement = locoScores.length
  ? locoScores.reduce((sum, value) => sum + value, 0) / locoScores.length
  : 0;
const stabilityPassed = campusKeys.length >= 4 && meanLOCOAgreement >= 0.70;
const configText = await readFile(new URL('../analytics-config/pilot-cutoffs.json', import.meta.url), 'utf8');
const pilotCutoffs = JSON.parse(configText);
await db.collection('analyticsConfig').doc('pilotCutoffs').set(pilotCutoffs, { merge: true });
const approved = pilotCutoffs?.approved === true
  && pilotCutoffs?.status === 'approved'
  && typeof pilotCutoffs?.approvedBy === 'string';
const output = {
  status: approved && enabled && !identityDominant && stabilityPassed ? 'available' : 'disabled',
  enabled: approved && enabled && !identityDominant && stabilityPassed,
  usableRows: usable.length,
  usableCampuses: campuses.size,
  stabilityMethod: 'leave-one-campus-out',
  k: 2,
  publishedMembership: false,
  diagnosticLabels: false,
  experimental: true,
  pilotCutoffsApproved: approved,
  stabilityMethod: 'leave-one-campus-out',
  meanLOCOAgreement,
  stabilityPassed,
  operationalUse: false,
  reason: !approved
    ? 'Real-pilot cutoffs are not approved; clustering remains experimental.'
    : !enabled
    ? 'Needs at least 30 usable locked campus-period rows across at least 4 campuses.'
    : identityDominant
      ? 'Identity dominance check is inconclusive or dominant.'
      : 'Release gate passed; stability review still required before operational use.',
  computedAt: Timestamp.fromDate(new Date()),
};
await db.collection('analytics').doc('clusteringStatus').set(output, { merge: true });
console.log(`Clustering status: ${output.status}; ${usable.length} usable rows, ${campuses.size} campuses.`);
