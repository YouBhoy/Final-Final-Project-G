/**
 * SPARTAN-G — READ-ONLY Firebase feasibility audit for the Super Admin feature.
 *
 * Verifies what is actually possible with the current Firebase configuration:
 *   • Firebase Auth  — user counts by role, custom claims presence
 *   • Firestore      — root collections, doc counts for key collections
 *   • Admin SDK      — credential validity
 *
 * Makes NO writes. Safe to run at any time.
 *
 * Usage: node scripts/audit-firebase.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json');

if (!existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`[!] Missing ${SERVICE_ACCOUNT_PATH}`);
  process.exit(1);
}

const { initializeApp, cert } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore } = await import('firebase-admin/firestore');

initializeApp({ credential: cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))) });

const auth = getAuth();
const db = getFirestore();

const INTERESTING = [
  'users',
  'profiles',
  'resources',
  'audit_logs',
  'assessment_templates',
  'announcements',
];

console.log('\n=== SPARTAN-G Firebase audit (read-only) ===\n');

// ── 1. Firebase Auth ────────────────────────────────────────────
console.log('--- Firebase Auth ---');
const roleCounts = {};
let claimsUsers = 0;
let pageToken;
let totalAuthUsers = 0;
const samples = [];
for (;;) {
  const res = await auth.listUsers(1000, pageToken);
  if (res.users.length === 0) break;
  for (const u of res.users) {
    totalAuthUsers += 1;
    const claims = u.customClaims;
    if (claims && Object.keys(claims).length > 0) claimsUsers += 1;
    if (samples.length < 8) {
      samples.push({
        uid: u.uid,
        email: u.email,
        disabled: u.disabled,
        claims: claims && Object.keys(claims).length ? claims : null,
      });
    }
  }
  pageToken = res.pageToken;
  if (!pageToken) break;
}
console.log(`Total Auth users: ${totalAuthUsers}`);
console.log(`Users with custom claims: ${claimsUsers}`);

// role counts come from the Firestore user docs (that is where roles live)
const usersSnap = await db.collection('users').get();
for (const doc of usersSnap.docs) {
  const role = doc.data().role ?? '(no role)';
  roleCounts[role] = (roleCounts[role] ?? 0) + 1;
}
console.log('Firestore users/ role counts:', JSON.stringify(roleCounts));
console.log('Sample Auth users:', JSON.stringify(samples, null, 2));

// super admins
const admins = usersSnap.docs.filter((d) => d.data().role === 'super_admin');
console.log(`\nsuper_admin accounts: ${admins.length}`);
for (const a of admins) {
  console.log(`  • ${a.id} — ${a.data().email} (isActive=${a.data().isActive})`);
}

// ── 2. Firestore collections ────────────────────────────────────
console.log('\n--- Firestore root collections ---');
const collections = await db.listCollections();
const names = collections.map((c) => c.id).sort();
console.log(names.join(', '));

console.log('\n--- Doc counts (interesting collections) ---');
for (const name of INTERESTING) {
  const snap = await db.collection(name).limit(5000).get();
  console.log(`  ${name}: ${snap.size}${snap.size === 5000 ? '+ (capped)' : ''}`);
}

// ── 3. Existing resources docs (should be none today) ───────────
if (names.includes('resources')) {
  const res = await db.collection('resources').limit(5).get();
  console.log('\nSample resources docs:');
  res.docs.forEach((d) => console.log(`  • ${d.id}: ${JSON.stringify(d.data())}`));
} else {
  console.log('\nresources collection: DOES NOT EXIST yet (feature is a placeholder).');
}

// ── 4. Audit logs ───────────────────────────────────────────────
if (names.includes('audit_logs')) {
  const res = await db.collection('audit_logs').limit(5).get();
  console.log(`\naudit_logs docs: ${res.size} (sample)`);
} else {
  console.log('\naudit_logs collection: does not exist yet (rules + schema exist, no writes yet).');
}

console.log('\n=== Audit complete — no data was modified ===\n');
process.exit(0);
