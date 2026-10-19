import { calculatePHQ9Score, calculateGAD7Score, calculateDASS21Score } from '@spartan-g/shared-types';
import type { AssessmentAttemptDocument } from '@spartan-g/shared-types';
import { isSummaryRiskAvailable } from '@spartan-g/shared-services';

/** Display validation only. Original score/risk calculations are never changed. */
export function assessmentDisplay(attempt: AssessmentAttemptDocument) {
  const answers: Record<string, string> = {};
  const seen = new Set<string>(), invalid = new Set<string>();
  if (Array.isArray(attempt.answers)) for (const answer of attempt.answers) {
    if (!answer || typeof answer.questionId !== 'string') continue;
    const id = answer.questionId;
    if (seen.has(id)) invalid.add(id); seen.add(id);
    if (typeof answer.value !== 'string' || !/^[0-3]$/.test(answer.value)) invalid.add(id);
    else answers[id] = answer.value;
  }
  const complete = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`).every(id => seen.has(id) && !invalid.has(id));
  const phq = complete('phq', 9) ? calculatePHQ9Score(answers) : null;
  const gad = complete('gad', 7) ? calculateGAD7Score(answers) : null;
  const dass = complete('dass', 21) ? calculateDASS21Score(answers) : null;
  return { phq, gad, dass, isCritical: !!(phq?.isCritical || gad?.isCritical || dass?.isCritical), riskAvailable: isSummaryRiskAvailable(attempt) };
}

export function assessmentDate(value: unknown): string {
  try {
    const candidate = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function' ? value.toDate() : value;
    const date = candidate instanceof Date ? candidate : typeof candidate === 'string' || typeof candidate === 'number' ? new Date(candidate) : null;
    return date && Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Date unavailable';
  } catch { return 'Date unavailable'; }
}

export function assessmentOverview(attempt: AssessmentAttemptDocument, title?: string | null) {
  const display = assessmentDisplay(attempt);
  const lines = [
    `Assessment: ${title?.trim() || 'Name unavailable (definition is not accessible)'}`,
    `Status: ${attempt.status === 'submitted' ? 'Submitted' : attempt.status === 'graded' ? 'Graded' : attempt.status === 'in_progress' ? 'In progress' : 'Unavailable'}`,
    `Submitted: ${assessmentDate(attempt.submittedAt)}`,
  ];
  if (typeof attempt.attemptNumber === 'number' && Number.isInteger(attempt.attemptNumber) && attempt.attemptNumber > 0) lines.push(`Attempt: ${attempt.attemptNumber}`);
  if (typeof attempt.score === 'number' && Number.isFinite(attempt.score) && attempt.score >= 0 && attempt.score <= 100) lines.push(`Recorded assessment score: ${attempt.score}%`);
  if (display.phq) lines.push(`PHQ-9: ${display.phq.score}/27 (${display.phq.severity})`);
  if (display.gad) lines.push(`GAD-7: ${display.gad.score}/21 (${display.gad.severity})`);
  if (display.dass) lines.push(`DASS-21: Depression ${display.dass.depression.score}/42; Anxiety ${display.dass.anxiety.score}/42; Stress ${display.dass.stress.score}/42`);
  if (!display.phq && !display.gad && !display.dass) lines.push('Instrument scores unavailable: complete, valid instrument answers were not recorded. Missing answers are not zero scores.');
  lines.push(display.riskAvailable ? `Recorded overall risk: ${attempt.overallRiskLevel}; recorded risk score: ${attempt.overallRiskScore}/100.` : 'Overall risk classification: UNKNOWN / unavailable. No safe, low-risk or clinical conclusion can be inferred from missing metadata.');
  return { lines, riskAvailable: display.riskAvailable };
}
