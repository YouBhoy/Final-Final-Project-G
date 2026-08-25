/**
 * SPARTAN-G — Existing-user cleanup for the Campus rollout.
 *
 * Deletes ONLY user-account data so that freshly registered users are created
 * with the new required `campus` attribute:
 *
 *   1. Firebase Authentication users (all)
 *   2. Firestore  `users`    collection documents
 *   3. Firestore  `profiles` collection documents
 *
 * With the optional `--with-user-data` flag it ALSO deletes user-owned data
 * that references the deleted accounts:
 *
 *   appointments, conversations, messages, notifications, risk_alerts,
 *   facilitator_student_links, assessment_attempts, assessment_responses,
 *   device_tokens
 *
 * NEVER touched: firestore.rules / indexes, assessment_templates,
 * assessment_questions, assessments, courses, work_hours_schedules,
 * appointment_slots, and any other collection not listed above.
 *
 * Usage:
 *   1. npm install --save-dev firebase-admin   (repo root)
 *   2. Download a service-account key from the Firebase console
 *      (Project settings → Service accounts → Generate new private key)
 *      and save it as spartan-g/scripts/service-account.json
 *   3. Dry run (lists what would be deleted, changes nothing):
 *        node scripts/cleanup-users.mjs
 *   4. Actually delete:
 *        node scripts/cleanup-users.mjs --yes
 *   5. Optionally also purge user-owned data:
 *        node scripts/cleanup-users.mjs --yes --with-user-data
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const CONFIRM = args.has('--yes');
const WITH_USER_DATA = args.has('--with-user-data');

const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(
    `\n[!] Missing ${SERVICE_ACCOUNT_PATH}\n` +
      '    Download a service-account private key from the Firebase console\n' +
      '    (Project settings → Service accounts → Generate new private key)\n' +
      '    and save it as scripts/service-account.json. Do NOT commit it.\n',
  );
  process.exit(1);
}

/** Collections that are pure user-account data — always deleted. */
const ACCOUNT_COLLECTIONS = ['users', 'profiles'];

/** Collections that reference users — only deleted with --with-user-data. */
const USER_OWNED_COLLECTIONS = [
  'appointments',
  'conversations',
  'messages',
  'notifications',
  'risk_alerts',
  'facilitator_student_links',
  'assessment_attempts',
  'assessment_responses',
  'device_tokens',
];

const { initializeApp, cert } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');

initializeApp({ credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))) });

const auth = getAuth();
const db = getFirestore();

/** Delete every document in a collection (handles >500 docs via paging). */
async function deleteCollection(name) {
  const collectionRef = db.collection(name);
  let deleted = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = await collectionRef.limit(300).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;
    console.log(`    … ${name}: deleted ${deleted} docs so far`);
  }

  return deleted;
}

/** Delete every Firebase Auth user (paged listing). */
async function deleteAuthUsers() {
  let deleted = 0;
  let pageToken;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const listResult = await auth.listUsers(1000, pageToken);
    const users = listResult.users;
    if (users.length === 0) break;

    // deleteUsers() batches the deletes server-side (max 1000 per call)
    const uids = users.map((u) => u.uid);
    const result = await auth.deleteUsers(uids);
    deleted += uids.length - (result.errors?.length ?? 0);

    if (result.errors?.length) {
      result.errors.forEach((e) => console.error(`    ! auth delete failed: ${e.error?.message}`));
    }
    pageToken = listResult.pageToken;
    if (!pageToken) break;
  }
  return deleted;
}

async function main() {
  console.log('\n=== SPARTAN-G user cleanup ===\n');
  console.log('Will delete:');
  console.log('  • ALL Firebase Authentication users');
  ACCOUNT_COLLECTIONS.forEach((c) => console.log(`  • Firestore collection: ${c}`));
  if (WITH_USER_DATA) {
    console.log('  With --with-user-data, also:');
    USER_OWNED_COLLECTIONS.forEach((c) => console.log(`  • Firestore collection: ${c}`));
  }
  console.log('\nWill NOT touch security rules, indexes, or any other collection.\n');

  if (!CONFIRM) {
    console.log('DRY RUN — nothing was deleted. Re-run with --yes to apply.\n');
    process.exit(0);
  }

  const authDeleted = await deleteAuthUsers();
  console.log(`  ✓ Firebase Auth users deleted: ${authDeleted}`);

  for (const name of ACCOUNT_COLLECTIONS) {
    const count = await deleteCollection(name);
    console.log(`  ✓ ${name}: ${count} docs deleted`);
  }

  if (WITH_USER_DATA) {
    for (const name of USER_OWNED_COLLECTIONS) {
      const count = await deleteCollection(name);
      console.log(`  ✓ ${name}: ${count} docs deleted`);
    }
  }

  console.log('\nDone. New registrations will now include the required campus attribute.\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n[!] Cleanup failed:', err);
  process.exit(1);
});
