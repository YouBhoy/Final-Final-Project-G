export interface ScoreResult {
  score: number;
  severity: string;
  isCritical: boolean;
}

function sumAnswers(answers: Record<string, string>, questionIds: string[]): number {
  return questionIds.reduce((sum, id) => {
    const val = answers[id];
    if (val === undefined || val === null || val === '') return sum;
    const num = Number(val);
    return sum + (isNaN(num) ? 0 : num);
  }, 0);
}

// ─── PHQ-9 ──────────────────────────────────────────────────────
const PHQ_QUESTIONS = ['phq1', 'phq2', 'phq3', 'phq4', 'phq5', 'phq6', 'phq7', 'phq8', 'phq9'];

export function calculatePHQ9Score(answers: Record<string, string>): ScoreResult {
  const score = sumAnswers(answers, PHQ_QUESTIONS);

  if (score >= 0 && score <= 4) {
    return { score, severity: 'Minimal depression', isCritical: false };
  }
  if (score >= 5 && score <= 9) {
    return { score, severity: 'Mild depression', isCritical: false };
  }
  if (score >= 10 && score <= 14) {
    return { score, severity: 'Moderate depression', isCritical: true };
  }
  if (score >= 15 && score <= 19) {
    return { score, severity: 'Moderately severe depression', isCritical: true };
  }
  // score >= 20 (max 27)
  return { score, severity: 'Severe depression', isCritical: true };
}

// ─── GAD-7 ──────────────────────────────────────────────────────
const GAD_QUESTIONS = ['gad1', 'gad2', 'gad3', 'gad4', 'gad5', 'gad6', 'gad7'];

export function calculateGAD7Score(answers: Record<string, string>): ScoreResult {
  const score = sumAnswers(answers, GAD_QUESTIONS);

  if (score >= 0 && score <= 4) {
    return { score, severity: 'Minimal anxiety', isCritical: false };
  }
  if (score >= 5 && score <= 9) {
    return { score, severity: 'Mild anxiety', isCritical: false };
  }
  if (score >= 10 && score <= 14) {
    return { score, severity: 'Moderate anxiety', isCritical: true };
  }
  // score >= 15 (max 21)
  return { score, severity: 'Severe anxiety', isCritical: true };
}

// ─── DASS-21 ─────────────────────────────────────────────────────
const DASS_DEPRESSION_ITEMS = ['dass3', 'dass5', 'dass10', 'dass13', 'dass16', 'dass17', 'dass21'];
const DASS_ANXIETY_ITEMS = ['dass2', 'dass4', 'dass7', 'dass9', 'dass15', 'dass19', 'dass20'];
const DASS_STRESS_ITEMS = ['dass1', 'dass6', 'dass8', 'dass11', 'dass12', 'dass14', 'dass18'];

function calculateDASSSubscale(answers: Record<string, string>, items: string[], thresholds: { min: number; max: number; severity: string; isCritical: boolean }[]): ScoreResult {
  const rawScore = sumAnswers(answers, items);
  const doubled = rawScore * 2;

  for (const t of thresholds) {
    if (doubled >= t.min && doubled <= t.max) {
      return { score: doubled, severity: t.severity, isCritical: t.isCritical };
    }
  }
  // Fallback: beyond highest threshold
  const last = thresholds[thresholds.length - 1];
  return { score: doubled, severity: last.severity, isCritical: last.isCritical };
}

function depressionThresholds() {
  return [
    { min: 0, max: 9, severity: 'Normal', isCritical: false },
    { min: 10, max: 13, severity: 'Mild', isCritical: false },
    { min: 14, max: 20, severity: 'Moderate', isCritical: true },
    { min: 21, max: 27, severity: 'Severe', isCritical: true },
    { min: 28, max: 999, severity: 'Extremely severe', isCritical: true },
  ];
}

function anxietyThresholds() {
  return [
    { min: 0, max: 7, severity: 'Normal', isCritical: false },
    { min: 8, max: 9, severity: 'Mild', isCritical: false },
    { min: 10, max: 14, severity: 'Moderate', isCritical: true },
    { min: 15, max: 19, severity: 'Severe', isCritical: true },
    { min: 20, max: 999, severity: 'Extremely severe', isCritical: true },
  ];
}

function stressThresholds() {
  return [
    { min: 0, max: 14, severity: 'Normal', isCritical: false },
    { min: 15, max: 18, severity: 'Mild', isCritical: false },
    { min: 19, max: 25, severity: 'Moderate', isCritical: true },
    { min: 26, max: 33, severity: 'Severe', isCritical: true },
    { min: 34, max: 999, severity: 'Extremely severe', isCritical: true },
  ];
}

export interface DASS21Result {
  depression: ScoreResult;
  anxiety: ScoreResult;
  stress: ScoreResult;
  isCritical: boolean;
}

export function calculateDASS21Score(answers: Record<string, string>): DASS21Result {
  const depression = calculateDASSSubscale(answers, DASS_DEPRESSION_ITEMS, depressionThresholds());
  const anxiety = calculateDASSSubscale(answers, DASS_ANXIETY_ITEMS, anxietyThresholds());
  const stress = calculateDASSSubscale(answers, DASS_STRESS_ITEMS, stressThresholds());

  const isCritical = depression.isCritical || anxiety.isCritical || stress.isCritical;

  return { depression, anxiety, stress, isCritical };
}