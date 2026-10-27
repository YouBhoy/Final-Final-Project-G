/** Read-only request-history audit. Never exports identities, notes, or credentials.
 * Usage: node scripts/audit-referral-history.mjs --as-of=2026-10-27
 * Counts appointment documents as student-to-facilitator requests, not link documents.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DAY = 86400000;
const OFFSET = 8 * 3600000;
const localDate = ms => new Date(ms + OFFSET).toISOString().slice(0, 10);
function time(value) {
  if (value === null || value === undefined) return null;
  const ms = typeof value?.toMillis === 'function' ? value.toMillis()
    : value instanceof Date ? value.getTime()
    : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
}
function monday(ms) {
  const midnight = Date.parse(`${localDate(ms)}T00:00:00+08:00`);
  return midnight - ((new Date(midnight + OFFSET).getUTCDay() + 6) % 7) * DAY;
}

export function auditHistory(rows, asOf) {
  const cutoff = Date.parse(`${asOf}T00:00:00+08:00`) + DAY;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(cutoff)
    || localDate(cutoff - DAY) !== asOf) throw new Error('Use a valid --as-of=YYYY-MM-DD date.');
  const statuses = {}, dated = [], quality = {
    missingCreationDates: 0, invalidCreationDates: 0, legacyDateFallbacks: 0,
    conflictingCreationDates: 0, futureCreationDates: 0, missingCampusSnapshots: 0,
    explicitAcceptanceDates: 0, validAcceptanceDurations: 0, invalidAcceptanceDates: 0,
  };
  for (const row of rows) {
    const status = ['requested', 'accepted', 'rejected', 'completed', 'cancelled', 'no_show', 'reschedule_requested'].includes(row.status) ? row.status : 'unknown';
    statuses[status] = (statuses[status] ?? 0) + 1;
    const canonical = time(row.createdAt), legacy = time(row.created_at);
    if (canonical !== null && legacy !== null && canonical !== legacy) quality.conflictingCreationDates++;
    const created = canonical ?? legacy;
    if (created === null) {
      if (row.createdAt == null && row.created_at == null) quality.missingCreationDates++;
      else quality.invalidCreationDates++;
    } else if (created >= cutoff) quality.futureCreationDates++;
    else {
      dated.push(created);
      if (canonical === null) quality.legacyDateFallbacks++;
    }
    if (typeof row.campus !== 'string' || !row.campus.trim()) quality.missingCampusSnapshots++;
    if (row.acceptedAt != null) {
      quality.explicitAcceptanceDates++;
      const accepted = time(row.acceptedAt);
      if (accepted !== null && created !== null && accepted >= created && accepted < cutoff) quality.validAcceptanceDurations++;
      else quality.invalidAcceptanceDates++;
    }
  }
  dated.sort((a, b) => a - b);
  const weekly = [];
  if (dated.length) {
    const counts = new Map();
    for (const ms of dated) counts.set(monday(ms), (counts.get(monday(ms)) ?? 0) + 1);
    // Dates before the first stored record have unknown coverage, not verified zero demand.
    for (let start = monday(dated[0]); start < cutoff; start += 7 * DAY) {
      weekly.push({ weekStart: localDate(start), requests: counts.get(start) ?? 0,
        completeCalendarWeek: start + 7 * DAY <= cutoff,
        firstObservedWeek: start === monday(dated[0]) });
    }
  }
  return {
    asOf, timezone: 'Asia/Manila', requestDocuments: rows.length,
    datedRequestsThroughAsOf: dated.length,
    firstRequestDate: dated.length ? localDate(dated[0]) : null,
    lastRequestDate: dated.length ? localDate(dated.at(-1)) : null,
    observedCalendarDays: dated.length ? Math.round((Date.parse(`${localDate(dated.at(-1))}T00:00:00+08:00`) - Date.parse(`${localDate(dated[0])}T00:00:00+08:00`)) / DAY) + 1 : 0,
    weeksWithRequests: weekly.filter(w => w.requests > 0).length,
    completeCalendarWeeksAfterFirstObservedWeek: weekly.filter(w => w.completeCalendarWeek && !w.firstObservedWeek).length,
    statuses, quality, weekly,
    limitations: [
      'Collection: appointments. Each document is one stored request; reschedules reuse the document and are not separate new requests.',
      'Statuses are current states, not historical states as of a past report date.',
      'Zero-count weeks mean no stored records; complete logging and absence of deleted records are unverified.',
      'The first observed week may have incomplete logging; the current incomplete calendar week must not train a weekly count forecast.',
      'Real pilot versus test/seed provenance is unverified. Database presence does not establish real student demand.',
      'Acceptance timestamps measure acceptance only. Missing decline timestamps and overwritten status history cannot be reconstructed from updatedAt.',
    ],
  };
}

async function main() {
  const asOf = process.argv.find(arg => arg.startsWith('--as-of='))?.slice(8);
  if (!asOf) throw new Error('Specify --as-of=YYYY-MM-DD in Asia/Manila.');
  auditHistory([], asOf);
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Live-history audit refuses emulator data.');
  const { initializeApp, cert, deleteApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const credential = JSON.parse(readFileSync(new URL('./service-account.json', import.meta.url), 'utf8'));
  if (credential.project_id !== 'spartan-g-a2d80') throw new Error('Unexpected Firebase project.');
  const app = initializeApp({ credential: cert(credential) });
  const db = getFirestore(app);
  db.settings({ timeoutSeconds: 25 });
  try {
    const snapshot = await db.collection('appointments')
      .select('createdAt', 'created_at', 'status', 'campus', 'acceptedAt')
      .limit(10001).get();
    if (snapshot.size > 10000) throw new Error('Audit exceeds 10,000-record limit. No partial results reported.');
    console.log(JSON.stringify({ project: credential.project_id, source: 'live Firestore, read-only field projection',
      ...auditHistory(snapshot.docs.map(doc => doc.data()), asOf) }, null, 2));
  } finally { await db.terminate(); await deleteApp(app); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`Referral history audit failed: ${error.code ?? error.message}`); process.exitCode = 1; });
}
