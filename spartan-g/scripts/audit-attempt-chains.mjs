/**
 * SPARTAN-G — READ-ONLY audit of assessment attempt chains.
 *
 * The Firestore rule on `assessment_attempts` expects every attempt to be stored as
 * `{assessmentId}_{studentId}_{n}` with `attemptNumber == n`, numbered 1..n without gaps.
 * This script lists every student's attempts per assessment and flags chains that don't
 * follow that scheme, because those students can be blocked from starting a new attempt:
 *
 *   id_mismatch      the document id is not {assessmentId}_{studentId}_{n}
 *   number_mismatch  the attemptNumber field differs from the number in the id
 *   gap              a number between 1 and the highest is missing
 *   duplicate_number two attempts claim the same number
 *
 * Makes NO writes: it only runs one `select(...).get()` over `assessment_attempts`.
 * Do not point it at production unless you mean to read production.
 *
 * Usage (same service-account setup as the other scripts):
 *   node scripts/audit-attempt-chains.mjs              # only chains with problems
 *   node scripts/audit-attempt-chains.mjs --all        # every chain
 *   node scripts/audit-attempt-chains.mjs --json       # machine-readable output
 *
 * With FIRESTORE_EMULATOR_HOST set it reads the emulator and needs no service account.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FINISHED = ['submitted', 'graded'];

/**
 * Keep in step with analyzeAttemptChain in packages/shared-types/src/utils/attempt-chain.ts
 * (a test compares the two on the same fixtures).
 */
export function analyzeChain(assessmentId, studentId, attempts) {
  const prefix = `${assessmentId}_${studentId}_`;
  const entries = attempts.map((a) => {
    const fieldNumber = Number.isInteger(a.attemptNumber) && a.attemptNumber > 0 ? a.attemptNumber : null;
    const rest = a.id.startsWith(prefix) ? a.id.slice(prefix.length) : null;
    const idNumber = rest !== null && /^[1-9][0-9]*$/.test(rest) ? Number(rest) : null;
    const issues = [];
    if (idNumber === null) issues.push('id_mismatch');
    if (idNumber !== null && fieldNumber !== idNumber) issues.push('number_mismatch');
    return { id: a.id, status: typeof a.status === 'string' ? a.status : 'unknown', fieldNumber, idNumber, issues };
  });
  const numbers = entries.flatMap((e) => [e.idNumber, e.fieldNumber]).filter((n) => n !== null);
  const highest = numbers.length ? Math.max(...numbers) : 0;
  const effective = entries.map((e) => e.idNumber ?? e.fieldNumber).filter((n) => n !== null);
  const seen = new Set();
  const issues = new Set(entries.flatMap((e) => e.issues));
  for (const n of effective) {
    if (seen.has(n)) issues.add('duplicate_number');
    seen.add(n);
  }
  for (let n = 1; n <= highest; n += 1) {
    if (!seen.has(n)) {
      issues.add('gap');
      break;
    }
  }
  return {
    entries,
    highest,
    finishedCount: attempts.filter((a) => FINISHED.includes(a.status)).length,
    issues: [...issues],
    clean: issues.size === 0,
  };
}

/** Read every attempt and group by (assessmentId, studentId). Read-only. */
export async function auditAttemptChains(db) {
  const snapshot = await db
    .collection('assessment_attempts')
    .select('assessmentId', 'studentId', 'attemptNumber', 'status')
    .get();

  const groups = new Map();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const assessmentId = typeof data.assessmentId === 'string' ? data.assessmentId : '(missing assessmentId)';
    const studentId = typeof data.studentId === 'string' ? data.studentId : '(missing studentId)';
    const key = `${assessmentId}\u0000${studentId}`;
    if (!groups.has(key)) groups.set(key, { assessmentId, studentId, attempts: [] });
    groups.get(key).attempts.push({ id: doc.id, attemptNumber: data.attemptNumber, status: data.status });
  }

  const chains = [...groups.values()].map((group) => ({
    assessmentId: group.assessmentId,
    studentId: group.studentId,
    ...analyzeChain(group.assessmentId, group.studentId, group.attempts),
  }));
  chains.sort((a, b) => a.assessmentId.localeCompare(b.assessmentId) || a.studentId.localeCompare(b.studentId));

  const problems = chains.filter((c) => !c.clean);
  return {
    totalAttempts: snapshot.size,
    totalChains: chains.length,
    problemChains: problems.length,
    chains,
  };
}

function printReport(report, showAll) {
  const rows = report.chains.filter((c) => showAll || !c.clean);
  for (const chain of rows) {
    console.log(`\n${chain.clean ? 'OK ' : 'FLAG'} assessment=${chain.assessmentId} student=${chain.studentId}`);
    console.log(`     finished attempts: ${chain.finishedCount}, highest number: ${chain.highest}${chain.clean ? '' : `, issues: ${chain.issues.join(', ')}`}`);
    for (const e of [...chain.entries].sort((a, b) => (a.idNumber ?? a.fieldNumber ?? 0) - (b.idNumber ?? b.fieldNumber ?? 0))) {
      const flags = e.issues.length ? `  <- ${e.issues.join(', ')}` : '';
      console.log(`       ${e.id}  attemptNumber=${e.fieldNumber ?? '(none)'}  status=${e.status}${flags}`);
    }
  }
  console.log(`\n${report.totalAttempts} attempts in ${report.totalChains} (assessment, student) chains; ${report.problemChains} chain(s) flagged.`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');

  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-attempt-audit' });
    } else {
      const path = join(dirname(fileURLToPath(import.meta.url)), 'service-account.json');
      if (!existsSync(path)) {
        console.error(`[!] Missing ${path} (see the other scripts for how to create it, and do NOT commit it).`);
        process.exit(1);
      }
      initializeApp({ credential: cert(JSON.parse(readFileSync(path, 'utf8'))) });
    }
  }

  const where = process.env.FIRESTORE_EMULATOR_HOST ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}` : 'the project in service-account.json';
  console.error(`[read-only] reading assessment_attempts from ${where}`);
  const report = await auditAttemptChains(getFirestore());
  if (args.has('--json')) console.log(JSON.stringify(report, null, 2));
  else printReport(report, args.has('--all'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
