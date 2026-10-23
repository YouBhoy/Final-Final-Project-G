import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('This maintenance command targets production only.');
const credential = JSON.parse(readFileSync(new URL('./service-account.json', import.meta.url), 'utf8'));
if (credential.project_id !== 'spartan-g-a2d80') throw new Error('Unexpected Firebase project.');
initializeApp({ credential: cert(credential) });
const db = getFirestore();
const apply = process.argv.includes('--apply');
const result = await db.runTransaction(async transaction => {
  const [appointments, links] = await Promise.all([
    transaction.get(db.collection('appointments')), transaction.get(db.collection('facilitator_student_links')),
  ]);
  if (appointments.size > 400 || links.size > 400) throw new Error('Maintenance safety limit exceeded. No changes made.');
  const candidates = appointments.docs.filter(row => ['accepted', 'completed'].includes(row.data().status))
    .sort((a, b) => (b.data().scheduledAt?.toMillis?.() ?? 0) - (a.data().scheduledAt?.toMillis?.() ?? 0));
  let eligible = 0;
  for (const row of links.docs) {
    const link = row.data();
    if (link.status !== 'accepted' || link.appointmentId || row.id !== `${link.facilitatorId}_${link.studentId}`) continue;
    const booking = candidates.find(appointment => appointment.data().studentId === link.studentId
      && appointment.data().facilitatorId === link.facilitatorId);
    if (!booking) continue;
    eligible++;
    // Add only a verified reference; do not invent student consent or change assignment status.
    if (apply) transaction.update(row.ref, { appointmentId: booking.id });
  }
  return { project: credential.project_id, eligibleLinks: eligible, applied: apply };
});
console.log(JSON.stringify(result));
