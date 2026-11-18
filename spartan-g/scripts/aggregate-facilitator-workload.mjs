import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'spartan-g-a2d80';
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const now = new Date();
const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

function millis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds !== undefined) return Number(value.seconds) * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const [facilitatorUsers, schedules, appointments] = await Promise.all([
  db.collection('users').where('role', '==', 'facilitator').where('isActive', '==', true).get(),
  db.collection('work_hours_schedules').where('isActive', '==', true).get(),
  db.collection('appointments').get(),
]);

const activeFacilitators = facilitatorUsers.docs.map(doc => ({ id: doc.id, ...doc.data() }));
const schedulesByCampus = new Map();
for (const scheduleDoc of schedules.docs) {
  const schedule = scheduleDoc.data();
  const facilitator = activeFacilitators.find(row => row.id === schedule.facilitatorId);
  if (!facilitator?.campus) continue;
  const key = facilitator.campus;
  const rows = schedulesByCampus.get(key) ?? [];
  rows.push(schedule);
  schedulesByCampus.set(key, rows);
}

const batch = db.batch();
let writes = 0;
for (const campus of new Set(activeFacilitators.map(row => row.campus).filter(Boolean))) {
  const campusFacilitators = activeFacilitators.filter(row => row.campus === campus);
  const campusIds = new Set(campusFacilitators.map(row => row.id));
  const campusSchedules = schedulesByCampus.get(campus) ?? [];
  const monthlyRequests = appointments.docs.filter(doc => {
    const appointment = doc.data();
    const created = millis(appointment.createdAt);
    return campusIds.has(appointment.facilitatorId) && created !== null
      && created >= start.getTime() && created < now.getTime();
  }).length;

  const availabilitySlots = campusSchedules.length;
  const ratio = availabilitySlots ? monthlyRequests / availabilitySlots : null;
  const band = ratio === null ? 'Insufficient data'
    : ratio <= 2 ? 'Limited' : ratio <= 5 ? 'Moderate' : 'Adequate';
  const facilitatorCount = campusFacilitators.length;
  const countPublished = facilitatorCount >= 5
    ? { value: facilitatorCount, suppressed: false, display: String(facilitatorCount) }
    : { value: null, suppressed: true, display: 'Fewer than 5' };

  const ref = db.collection('analytics').doc('facilitatorWorkload').collection('records')
    .doc(`${campus}_monthly_${start.toISOString().slice(0, 10)}`);
  batch.set(ref, {
    campusKey: campus,
    periodStartDate: start.toISOString().slice(0, 10),
    interval: 'monthly',
    locked: false,
    isComplete: false,
    dataPhase: 'development',
    cutoffVersion: 'workload-draft-1',
    cutoffStatus: 'draft',
    aggregationVersion: '1',
    computedAt: Timestamp.fromDate(now),
    facilitatorCount: countPublished,
    activeAvailabilitySlots: availabilitySlots >= 5
      ? { value: availabilitySlots, suppressed: false, display: String(availabilitySlots) }
      : { value: null, suppressed: true, display: 'Fewer than 5' },
    monthlyRequests: monthlyRequests >= 5
      ? { value: monthlyRequests, suppressed: false, display: String(monthlyRequests) }
      : { value: null, suppressed: true, display: 'Fewer than 5' },
    capacityBand: band,
  }, { merge: true });
  writes++;
}
await batch.commit();
console.log(`Wrote ${writes} campus facilitator-workload aggregate documents.`);
