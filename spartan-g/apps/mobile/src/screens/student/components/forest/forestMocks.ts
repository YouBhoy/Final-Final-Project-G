// ─── Forest preview fixtures (dev only) ────────────────────────────────────
// Builds synthetic check-ins so the redesigned island can be previewed at 0, 1,
// 12 and 50+ trees without touching Firestore. Uses the SAME builder the screen
// uses, so anything you see here is exactly what real data renders.
//
// Enable via the Forest screen's mock menu (long-press the "My Forest" title) —
// the preview is local to the screen and never writes to the backend.

import type { AssessmentAttemptDocument } from '@spartan-g/shared-types';
import { buildForestCheckIns, type AttemptWithDef, type ForestCheckIn } from './forestUtils';

export type ForestPreviewKey = 'real' | 'zero' | 'one' | 'twelve' | 'fifty';

/** Menu entries for the on-screen preview switcher. */
export const FOREST_PREVIEW_OPTIONS: { key: ForestPreviewKey; label: string }[] = [
  { key: 'real', label: 'Real data' },
  { key: 'zero', label: '0 check-ins' },
  { key: 'one', label: '1 check-in' },
  { key: 'twelve', label: '12 check-ins' },
  { key: 'fifty', label: '50+ check-ins' },
];

const PHQ_IDS = Array.from({ length: 9 }, (_, i) => `phq9_q${i + 1}`);
const PHQ_AND_GAD_IDS = [...PHQ_IDS, ...Array.from({ length: 7 }, (_, i) => `gad7_q${i + 1}`)];
const DASS_IDS = Array.from({ length: 21 }, (_, i) => `dass21_q${i + 1}`);

interface MockSpec {
  attemptId: string;
  daysAgo: number;
  hour: number;
  minutes: number;
  answered: number;
  questionIds: string[];
  /** Skipped calendar days before this check-in → renders as a withered tree. */
  breakStreak?: boolean;
}

/**
 * Deterministic fixture set. `breakStreak` inserts a multi-day gap so the
 * withered-tree look can be reviewed without waiting for a real lapse.
 */
function mockSpecs(count: number): MockSpec[] {
  const specs: MockSpec[] = [];
  // Spread `count` check-ins over the last ~70 days, newest last.
  const gapDays = count > 20 ? 1 : count > 6 ? 2 : 5;
  let dayCursor = count === 0 ? 0 : (count - 1) * gapDays;
  for (let i = 0; i < count; i++) {
    const ids =
      i % 5 === 0 ? PHQ_AND_GAD_IDS : i % 5 === 1 ? PHQ_IDS : i % 5 === 2 ? DASS_IDS : PHQ_IDS;
    specs.push({
      attemptId: `preview_${count}_${String(i).padStart(3, '0')}`,
      daysAgo: dayCursor,
      hour: 7 + ((i * 3) % 12),
      minutes: 4 + ((i * 7) % 22),
      answered: Math.max(3, ids.length - ((i * 2) % 4)),
      questionIds: ids,
      // Two deliberate streak breaks so the withered trees show up.
      breakStreak: count > 8 && (i === Math.floor(count * 0.35) || i === Math.floor(count * 0.7)),
    });
    dayCursor -= (specs[i].breakStreak ? 6 : 1) * gapDays;
  }
  return specs;
}

/**
 * Build preview check-ins through the production pipeline.
 * @param count number of synthetic check-ins (0, 1, 12, 50+…)
 */
export function buildPreviewCheckIns(count: number): ForestCheckIn[] {
  if (count <= 0) return [];
  const entries: AttemptWithDef[] = mockSpecs(count).map((spec) => {
    const submitted = new Date();
    submitted.setDate(submitted.getDate() - spec.daysAgo);
    submitted.setHours(spec.hour, spec.minutes, 0, 0);
    const started = new Date(submitted.getTime() - spec.minutes * 60000);

    const answers = spec.questionIds
      .slice(0, spec.answered)
      .map((questionId) => ({ questionId, value: '2', answeredAt: submitted as never }));

    const attempt = {
      id: spec.attemptId,
      assessmentId: `preview_assessment_${spec.questionIds.length}`,
      studentId: 'preview_student',
      answers,
      status: 'graded',
      startedAt: started as never,
      submittedAt: submitted as never,
      attemptNumber: 1,
    } as unknown as AssessmentAttemptDocument & { id: string };

    return {
      attempt,
      def: { questions: spec.questionIds.map((id) => ({ id })) },
    };
  });

  return buildForestCheckIns(entries);
}

/** Preview datasets are built once, on first use, then reused. */
const previewCache: Partial<Record<ForestPreviewKey, ForestCheckIn[]>> = {};

const PREVIEW_COUNTS: Record<Exclude<ForestPreviewKey, 'real'>, number> = {
  zero: 0,
  one: 1,
  twelve: 12,
  fifty: 56,
};

/**
 * Resolve a preview key to synthetic check-ins.
 * 'real' returns an empty array — the screen keeps using live data for it.
 */
export function previewFor(key: ForestPreviewKey): ForestCheckIn[] {
  if (key === 'real') return [];
  if (!previewCache[key]) previewCache[key] = buildPreviewCheckIns(PREVIEW_COUNTS[key]);
  return previewCache[key] as ForestCheckIn[];
}
