// Dry run by default. Backfill existing live intervals before enabling Spark booking.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const credential = JSON.parse(readFileSync(new URL('./service-account.json', import.meta.url), 'utf8'));
if (credential.project_id !== 'spartan-g-a2d80') throw new Error('Unexpected Firebase project.');
initializeApp({ credential: cert(credential) });
const db = getFirestore();
const snapshot = await db.collection('appointments').get();
const reservations = new Map();
let active = 0;
for (const document of snapshot.docs) {
  const data = document.data();
  if (!['requested', 'accepted'].includes(data.status)) continue;
  active++;
  const start = data.scheduledAt?.toMillis?.();
  if (!Number.isSafeInteger(start) || !Number.isInteger(data.durationMinutes)
    || data.durationMinutes <= 0 || data.durationMinutes > 1440
    || [data.studentId, data.facilitatorId].some(id => typeof id !== 'string' || !id || id.includes('/'))) {
    throw new Error('An active appointment has invalid scheduling data. Migration stopped without writes.');
  }
  for (let slot = Math.floor(start / 1800000); slot < Math.ceil((start + data.durationMinutes * 60000) / 1800000); slot++) {
    for (const [kind, participantId] of [['f', data.facilitatorId], ['s', data.studentId]]) {
      const id = `${kind}_${participantId}_${slot}`;
      if (reservations.has(id) && reservations.get(id).appointmentId !== document.id) {
        throw new Error('Existing active bookings share a half-hour block. Resolve these bookings before migration. No writes made.');
      }
      reservations.set(id, { kind, participantId, slot, appointmentId: document.id });
    }
  }
}
console.log(`Validated ${active} active appointments; ${reservations.size} reservations required.`);
if (process.argv.includes('--apply')) {
  const config = await db.doc('appointment_booking_config/spark').get();
  if (config.data()?.version === 1) throw new Error('Spark booking is already enabled. This one-time migration must not be rerun while clients are booking.');
  const writer = db.bulkWriter();
  const writes = [];
  for (const [id, data] of reservations) writes.push(writer.set(db.doc(`appointment_reservations/${id}`), data));
  await Promise.all([...writes, writer.close()]);
  // This gate is written last. Partial migration cannot enable booking.
  await db.doc('appointment_booking_config/spark').set({ version: 1 });
  console.log('Reservations populated and Spark booking enabled. Existing appointments unchanged.');
} else {
  console.log('Dry run only. Use --apply to backfill and enable booking.');
}
