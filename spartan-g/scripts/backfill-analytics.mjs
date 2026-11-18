import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { spawnSync } from 'node:child_process';

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'spartan-g-a2d80';
const allowBackfill = process.argv.includes('--apply');
const reason = process.env.BACKFILL_REASON?.trim();
const startDate = process.env.BACKFILL_START_DATE;
const endDate = process.env.BACKFILL_END_DATE;
if (!reason || !startDate || !endDate) {
  throw new Error('Set BACKFILL_REASON, BACKFILL_START_DATE and BACKFILL_END_DATE.');
}
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
const now = Timestamp.fromDate(new Date());

const auditRef = db.collection('analyticsAudit').doc();
await auditRef.set({
  kind: 'backfill',
  projectId,
  backfillReason: reason,
  startDate,
  endDate,
  apply: allowBackfill,
  createdAt: now,
  publicPreviousStateStored: false,
}, { merge: false });

if (allowBackfill) {
  for (const script of [
    'scripts/aggregate-campus-periods.mjs',
    'scripts/aggregate-clustering-status.mjs',
    'scripts/aggregate-facilitator-workload.mjs',
  ]) {
    const result = spawnSync(process.execPath, [script], {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      await auditRef.set({
        rerunFailed: true,
        failedScript: script,
        rerunError: (result.stderr || result.stdout || 'Unknown rerun failure').slice(0, 4000),
      }, { merge: true });
      throw new Error(`Backfill rerun failed for ${script}`);
    }
  }
  await auditRef.set({ rerunCompleted: true, rerunCompletedAt: Timestamp.fromDate(new Date()) }, { merge: true });
}

console.log(`${allowBackfill ? 'Applied' : 'Prepared'} analytics backfill audit ${auditRef.id}.`);
console.log('This script intentionally requires aggregate scripts to rerun; no public previous state is stored.');
