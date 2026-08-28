/**
 * SPARTAN-G — Emulator end-to-end test for server-side push triggers.
 *
 * Seeds test data into the LOCAL Firestore emulator via the Admin SDK
 * (bypasses security rules by design), fires both onCreate triggers by
 * writing a message + appointment doc, waits for the functions to run,
 * then asserts every field of the produced in-app notification documents
 * against the parity contract shared with the mobile client.
 *
 * Usage:  node scripts/emulator-seed-and-test.mjs
 * Requires: `firebase emulators:start --only functions,firestore` running,
 *           FIRESTORE_EMULATOR_HOST set to the emulator's host:port.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8081';

initializeApp({ projectId: 'spartan-g-a2d80' });
const db = getFirestore();

const SENDER = 'u_sender';
const FACIL = 'u_facil';
const CONV = 'conv_test';
let failures = 0;

function check(label, actual, expected) {
  const pass =
    typeof expected === 'object'
      ? JSON.stringify(actual) === JSON.stringify(expected)
      : actual === expected;
  console.log(` ${pass ? '✅' : '❌'} ${label}: ${JSON.stringify(actual)}${pass ? '' : ` (expected ${JSON.stringify(expected)})`}`);
  if (!pass) failures++;
}

async function wipe() {
  const cols = ['users', 'conversations', 'device_tokens', 'messages', 'appointments', 'notifications'];
  for (const c of cols) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

// The exact regex used by apps/mobile/src/adapters/expo-messaging.adapter.ts
const SUPPRESSION_URL_REGEX =
  /^spartan-g:\/\/(?:student|facilitator)\/conversation\/(.+)$/;

console.log('→ wiping emulator data…');
await wipe();

console.log('→ seeding users / conversation / device tokens…');
await db.doc(`users/${SENDER}`).set({ displayName: 'Maria Santos', role: 'student', isActive: true });
await db.doc(`users/${FACIL}`).set({ displayName: 'Dr. Cruz', role: 'facilitator', isActive: true });
await db.collection('conversations').doc(CONV).set({
  participantIds: [SENDER, FACIL],
});
await db.collection('device_tokens').doc('tok_valid').set({
  uid: FACIL,
  token: 'ExponentPushToken[abcdefabcdefabcdefabcd12]', // valid Expo FORMAT, fake value
});
await db.collection('device_tokens').doc('tok_bad').set({
  uid: FACIL,
  token: 'garbage-not-a-token', // must be filtered out before network call
});

// ─── Test 1: message trigger ────────────────────────────────────────────────
console.log('\n=== TEST 1: message onCreate → facilitator notification ===');
await db.collection('messages').doc('msg_test1').set({
  conversationId: CONV,
  senderId: SENDER,
  body: 'Hello Dr. Cruz, message sent from the emulator test!',
  createdAt: FieldValue.serverTimestamp(),
});

// Give the functions emulator time to execute the trigger.
await new Promise((r) => setTimeout(r, 6000));

const msgNotifSnap = await db.doc(`notifications/notif_msg_msg_test1_${FACIL}`).get();
check('message in-app notif created (deterministic id)', msgNotifSnap.exists, true);
if (msgNotifSnap.exists) {
  const n = msgNotifSnap.data();
  check('title = sender displayName', n.title, 'Maria Santos');
  check('body echoes message body', n.body, 'Hello Dr. Cruz, message sent from the emulator test!');
  check('type', n.type, 'message');
  check('isRead', n.isRead, false);
  check('relatedId = conversationId', n.relatedId, CONV);
  check(
    'data.url deep link (role-prefixed)',
    n.data?.url,
    'spartan-g://facilitator/conversation/conv_test',
  );
  const m = SUPPRESSION_URL_REGEX.exec(n.data?.url ?? '');
  check('url matches mobile suppression regex', Boolean(m), true);
  if (m) check('regex captures conversationId', m[1], CONV);
  check('createdAt stamped', Boolean(n.createdAt), true);
}

// ─── Test 2: appointment trigger ────────────────────────────────────────────
console.log('\n=== TEST 2: appointment onCreate → facilitator notification ===');
await db.collection('appointments').doc('apt_test1').set({
  studentId: SENDER,
  facilitatorId: FACIL,
  status: 'requested',
  scheduledAt: new Date('2026-09-01T08:30:00Z'),
  durationMinutes: 45,
  createdAt: FieldValue.serverTimestamp(),
});
await new Promise((r) => setTimeout(r, 6000));

const aptNotifSnap = await db.doc(`notifications/notif_apt_apt_test1_${FACIL}`).get();
check('appointment in-app notif created (deterministic id)', aptNotifSnap.exists, true);
if (aptNotifSnap.exists) {
  const n = aptNotifSnap.data();
  check('title', n.title, 'New Appointment Request');
  check(
    'body pattern (Asia/Manila formatted time)',
    /^A student has requested an appointment at .+\.$/.test(n.body),
    true,
  );
  check('type', n.type, 'appointment');
  check('relatedId = appointmentId', n.relatedId, 'apt_test1');
  check('data.url', n.data?.url, 'spartan-g://facilitator/appointments');
}

// ─── Test 3: guard — non-requested appointment must NOT notify ──────────────
console.log('\n=== TEST 3: accepted appointment does NOT re-notify ===');
await db.collection('appointments').doc('apt_accepted').set({
  studentId: SENDER,
  facilitatorId: FACIL,
  status: 'accepted',
  scheduledAt: new Date('2026-09-02T10:00:00Z'),
  createdAt: FieldValue.serverTimestamp(),
});
await new Promise((r) => setTimeout(r, 5000));
check(
  'no notification written for accepted doc',
  !(await db.doc(`notifications/notif_apt_apt_accepted_${FACIL}`).get()).exists,
  true,
);

console.log(`\n${failures === 0 ? '🎉 ALL CHECKS PASSED' : `💥 ${failures} CHECK(S) FAILED`} — see emulator stdout for [push] ticket logs.`);
process.exit(failures === 0 ? 0 : 1);