/**
 * SPARTAN-G — Promote/demote a Super Admin account (Admin SDK).
 *
 * Super Admin accounts CANNOT be self-registered (the Firestore users
 * create rule only allows role student/facilitator for self-signup), so
 * this trusted server-side script is the supported provisioning path.
 *
 * Usage:
 *   node scripts/promote-superadmin.mjs user@example.com
 *   node scripts/promote-superadmin.mjs user@example.com --demote
 *
 * What it does:
 *   1. Looks up the Firebase Auth account by email.
 *   2. Sets users/{uid}.role = 'super_admin' | 'student' (keeps isActive).
 *   3. Ensures profiles/{uid} exists so portal profile pages work.
 *
 * Run from the spartan-g/ directory. Requires scripts/service-account.json.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');

const args = process.argv.slice(2);
const demote = args.includes('--demote');
const email = args.find((a) => !a.startsWith('--'));

if (!email) {
  console.error('Usage: node scripts/promote-superadmin.mjs <email> [--demote]');
  process.exit(1);
}
if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`[!] Missing ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

initializeApp({ credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))) });
const auth = getAuth();
const db = getFirestore();

try {
  const user = await auth.getUserByEmail(email);
  const role = demote ? 'student' : 'super_admin';

  await db.doc(`users/${user.uid}`).set(
    {
      role,
      isActive: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const profileRef = db.doc(`profiles/${user.uid}`);
  const profile = await profileRef.get();
  if (!profile.exists) {
    await profileRef.set({
      uid: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  console.log(`\n✓ ${email} (${user.uid}) is now: ${role}`);
  if (!demote) {
    console.log('  Sign in at /login — you will be redirected to /admin/dashboard.\n');
  }
  process.exit(0);
} catch (err) {
  console.error('\n[!] Failed:', err.message);
  process.exit(1);
}
