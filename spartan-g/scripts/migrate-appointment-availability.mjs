// Run during a maintenance window after deploying the updated appointment clients.
// Dry run by default. Never copies notes, student identities or clinical outcomes.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const credential = JSON.parse(readFileSync(new URL('./service-account.json', import.meta.url), 'utf8'));
if (credential.project_id !== 'spartan-g-a2d80') throw new Error('Unexpected Firebase project.');
initializeApp({ credential: cert(credential) });
const db = getFirestore();
const snapshot = await db.collection('appointments').get();
function publicData(data) {
  if (typeof data.facilitatorId !== 'string' || !data.facilitatorId || !Number.isFinite(data.scheduledAt?.toMillis?.())
    || !Number.isFinite(data.durationMinutes) || data.durationMinutes <= 0 || typeof data.status !== 'string') {
    throw new Error('Invalid appointment scheduling metadata. Correct it before migration.');
  }
  return { facilitatorId: data.facilitatorId, scheduledAt: data.scheduledAt, durationMinutes: data.durationMinutes, status: data.status };
}
snapshot.docs.forEach(row => publicData(row.data()));
console.log(`Validated ${snapshot.size} appointments for a public scheduling projection.`);
if (process.argv.includes('--apply')) {
  const gate = db.doc('appointment_booking_config/spark');
  if ((await gate.get()).data()?.version !== 1) throw new Error('Initialize the reservation-based booking system first.');
  await gate.update({ availabilityVersion: 0 });
  for (const row of snapshot.docs) {
    await db.runTransaction(async transaction => {
      const current = await transaction.get(row.ref);
      if (current.exists) transaction.set(db.doc(`appointment_availability/${row.id}`), publicData(current.data()));
    });
  }
  // Publish readiness last; partial migration cannot show incomplete availability.
  await gate.update({ availabilityVersion: 1 });
  console.log('Public availability populated. Appointment notes remain private.');
} else {
  console.log('Dry run only. During maintenance, use --apply to populate scheduling metadata and enable availability.');
}
