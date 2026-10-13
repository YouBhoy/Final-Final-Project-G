// Run after changing publication or display metadata in the legacy assessments collection.
// Uses the existing local Admin SDK credential; never copies student data or questions.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { catalogEntry } from './assessment-catalog-data.mjs';

const credential = JSON.parse(readFileSync(new URL('./service-account.json', import.meta.url), 'utf8'));
if (credential.project_id !== 'spartan-g-a2d80') throw new Error('Unexpected Firebase project.');
initializeApp({ credential: cert(credential) });
const db = getFirestore();
const source = await db.collection('assessments').get();
const existing = await db.collection('assessment_catalog').get();
const entries = new Map(source.docs.flatMap(doc => {
  const entry = catalogEntry(doc.data());
  return entry ? [[doc.id, entry]] : [];
}));
const writer = db.bulkWriter();
for (const [id, entry] of entries) writer.set(db.collection('assessment_catalog').doc(id), entry);
for (const doc of existing.docs) if (!entries.has(doc.id)) writer.delete(doc.ref);
await writer.close();
console.log(`Published ${entries.size} assessment catalog entries. Source documents were unchanged.`);
