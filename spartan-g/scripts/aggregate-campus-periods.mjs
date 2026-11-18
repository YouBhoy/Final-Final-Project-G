import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'spartan-g-a2d80';
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const DAY_MS = 86400000;
const LOCK_LAG_DAYS = 7;
const SYNTHETIC_SEED_TAG = 'synthetic-analytics-demo-2026';

function timestampValue(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds !== undefined) return Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1000000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function manilaDateParts(date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = type => Number(parts.find(part => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function publicCount(value) {
  if (value >= 1 && value <= 4) return { value: null, suppressed: true, display: 'Fewer than 5' };
  return { value, suppressed: false, display: String(value) };
}

function publicDenominator(value) {
  return publicCount(value);
}

function campusKey(record, campusLabels, unknownKey = '__unknown__') {
  if (typeof record.campus === 'string' && record.campus.trim()) {
    if (campusLabels.has(record.campus)) return record.campus;
  }
  return unknownKey;
}

async function documents(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

const now = new Date();
const parts = manilaDateParts(now);
const months = [];
for (let offset = 11; offset >= 0; offset--) {
  const start = new Date(Date.UTC(parts.year, parts.month - 1 - offset, 1));
  const partsForStart = manilaDateParts(start);
  const monthStart = new Date(Date.UTC(partsForStart.year, partsForStart.month - 1, 1));
  const monthEnd = new Date(Date.UTC(partsForStart.year, partsForStart.month, 1));
  months.push({
    periodStartDate: isoDate(partsForStart.year, partsForStart.month, 1),
    periodStartTimestamp: Timestamp.fromMillis(monthStart.getTime() - 8 * 60 * 60 * 1000),
    periodEndExclusiveTimestamp: Timestamp.fromMillis(monthEnd.getTime() - 8 * 60 * 60 * 1000),
  });
}

const [users, campuses, appointments, attempts] = await Promise.all([
  documents('users'),
  documents('campuses'),
  documents('appointments'),
  documents('assessment_attempts'),
]);

const campusLabels = new Map(campuses.map(campus => [campus.key || campus.id, campus.label || campus.key || campus.id]));
campusLabels.set('__unknown__', 'Unknown / Unassigned');

const batch = db.batch();
let writes = 0;

for (const month of months) {
  const start = month.periodStartTimestamp.toMillis();
  const end = month.periodEndExclusiveTimestamp.toMillis();
  const locked = now.getTime() >= end + LOCK_LAG_DAYS * DAY_MS;

  const rows = [...campusLabels.keys()].map(key => {
    const registeredUsers = users.filter(user =>
      user.role === 'student'
      && campusKey(user, campusLabels) === key
      && (timestampValue(user.createdAt) ?? timestampValue(user.created_at) ?? Infinity) < end,
    );
    const registeredIds = new Set(registeredUsers.map(user => user.id));

    const appointmentRequests = appointments.filter(request => {
      const created = timestampValue(request.createdAt) ?? timestampValue(request.created_at);
      return created !== null
        && created >= start
        && created < end
        && registeredIds.has(request.studentId)
        && campusKey(request, campusLabels) === key;
    });

    const submittedAttempts = attempts.filter(attempt => {
      const submitted = timestampValue(attempt.submittedAt) ?? timestampValue(attempt.submitted_at);
      return submitted !== null
        && submitted >= start
        && submitted < end
        && ['submitted', 'graded'].includes(attempt.status)
        && registeredIds.has(attempt.studentId)
        && campusKey(attempt, campusLabels) === key;
    });

    const participationIds = new Set([
      ...appointmentRequests.map(request => request.studentId),
      ...submittedAttempts.map(attempt => attempt.studentId),
    ]);
    const participantCount = participationIds.size;
    const requestCount = appointmentRequests.length;
    const submissionCount = submittedAttempts.length;

    const registeredPublic = publicDenominator(registeredIds.size);
    const participantPublic = publicCount(participantCount);
    const requestPublic = publicCount(requestCount);
    const submissionPublic = publicCount(submissionCount);

    const registered = registeredIds.size;
    const participationRate = registered ? participantCount / registered : null;
    const appointmentRate = registered ? requestCount / registered : null;
    const assessmentSubmissionRate = registered ? submissionCount / registered : null;

    return {
      campusKey: key,
      campusLabel: campusLabels.get(key),
      periodStartDate: month.periodStartDate,
      periodStart: month.periodStartTimestamp,
      periodEndExclusive: month.periodEndExclusiveTimestamp,
      interval: 'monthly',
      isComplete: locked,
      locked,
      dataPhase: users
        .filter(user => registeredIds.has(user.id))
        .every(user => user.syntheticSeed === SYNTHETIC_SEED_TAG)
        && registeredIds.size > 0
          ? 'development'
          : 'real_pilot',
      cutoffVersion: 'campus-support-draft-1',
      cutoffStatus: 'draft',
      aggregationVersion: '1',
      computedAt: Timestamp.fromDate(now),
      revision: 1,
      registeredStudentUsers: registeredPublic,
      participatingStudents: participantPublic,
      appointmentRequests: requestPublic,
      assessmentSubmissions: submissionPublic,
      participationRateBand: registered >= 20
        ? participationRate <= 0.30 ? 'Limited' : participationRate <= 0.60 ? 'Moderate' : 'Adequate'
        : 'Insufficient data',
      appointmentDemandBand: registered >= 20
        ? appointmentRate <= 0.25 ? 'Low' : appointmentRate <= 0.75 ? 'Moderate' : 'High'
        : 'Insufficient data',
      assessmentSubmissionBand: registered >= 20
        ? assessmentSubmissionRate <= 0.10 ? 'Low' : assessmentSubmissionRate <= 0.25 ? 'Moderate' : 'High'
        : 'Insufficient data',
    };
  });

  for (const row of rows) {
    const id = `${row.campusKey}_monthly_${row.periodStartDate}`;
    const ref = db.collection('analytics').doc('campusPeriods').collection('records').doc(id);
    batch.set(ref, row, { merge: true });
    writes++;
  }

  function institutionCount(metric) {
    const values = rows.map(row => row[metric]);
    if (values.some(value => value.suppressed)) {
      return { value: null, suppressed: true, display: 'Not shown' };
    }
    return publicCount(values.reduce((sum, value) => sum + (value.value ?? 0), 0));
  }
  const institutionRegistered = institutionCount('registeredStudentUsers');
  const institutionParticipants = institutionCount('participatingStudents');
  const institutionRequests = institutionCount('appointmentRequests');
  const institutionSubmissions = institutionCount('assessmentSubmissions');
  const institutionId = `institution_monthly_${month.periodStartDate}`;
  const institutionRef = db.collection('analytics').doc('institutionPeriods').collection('records').doc(institutionId);
  batch.set(institutionRef, {
    campusKey: 'institution',
    periodStartDate: month.periodStartDate,
    periodStart: month.periodStartTimestamp,
    periodEndExclusive: month.periodEndExclusiveTimestamp,
    interval: 'monthly',
    isComplete: locked,
    locked,
    dataPhase: 'development',
    cutoffVersion: 'campus-support-draft-1',
    cutoffStatus: 'draft',
    aggregationVersion: '1',
    computedAt: Timestamp.fromDate(now),
    revision: 1,
    registeredStudentUsers: institutionRegistered,
    participatingStudents: institutionParticipants,
    appointmentRequests: institutionRequests,
    assessmentSubmissions: institutionSubmissions,
  }, { merge: true });
  writes++;
}

await batch.commit();
console.log(`Wrote ${writes} campus-period aggregate documents for project ${projectId}.`);
