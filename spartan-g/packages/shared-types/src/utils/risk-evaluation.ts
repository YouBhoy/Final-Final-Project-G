import {
  calculatePHQ9Score,
  calculateGAD7Score,
  calculateDASS21Score,
  type ScoreResult,
  type DASS21Result,
} from './scoring';

// ─── Risk Flag Types ────────────────────────────────────────────

export type RiskFlagType =
  | 'severe_depression'
  | 'severe_anxiety'
  | 'severe_stress'
  | 'moderate_depression'
  | 'moderate_anxiety'
  | 'multiple_severe_domains'
  | 'immediate_attention';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface RiskFlag {
  type: RiskFlagType;
  label: string;
  severity: RiskLevel;
}

export interface RiskEvaluationResult {
  overallRiskLevel: RiskLevel;
  overallRiskScore: number;           // 0–100 composite
  requiresImmediateAttention: boolean;
  riskFlags: RiskFlag[];
  domainResults: {
    phq9: ScoreResult;
    gad7: ScoreResult;
    dass21: DASS21Result;
  };
}

// ─── Threshold Constants (single source of truth) ────────────────

/** PHQ-9 composite scoring thresholds (score → points contribution). */
export const PHQ9_THRESHOLDS = {
  /** Score ≥ this triggers moderate-to-severe depression contribution. */
  MODERATE_SEVERE_MIN: 15,
  SEVERE_POINTS: 40,
  MODERATE_POINTS: 30,
} as const;

/** GAD-7 composite scoring thresholds. */
export const GAD7_THRESHOLDS = {
  /** Score ≥ this triggers moderate-to-severe anxiety contribution. */
  MODERATE_SEVERE_MIN: 10,
  SEVERE_POINTS: 35,
  MODERATE_POINTS: 25,
} as const;

/** DASS-21 subscale thresholds (doubled score). */
export const DASS21_THRESHOLDS = {
  /** Any subscale doubled score ≥ this triggers severe contribution. */
  SEVERE_MIN: 21,
  SEVERE_POINTS: 30,
  /** Any subscale doubled score ≥ this triggers moderate contribution. */
  MODERATE_MIN: 14,
  MODERATE_POINTS: 20,
} as const;

/** Penalty for multiple severe domains. */
export const MULTIPLE_SEVERE_BONUS = 20;

/** Overall risk level score range mappings. */
export const OVERALL_RISK_THRESHOLDS = {
  LOW_MAX: 19,
  MODERATE_MAX: 39,
  HIGH_MAX: 69,
  // 70–100 → critical
} as const;

/** Maximum composite score. */
export const MAX_COMPOSITE_SCORE = 100;

// ─── Flag Definitions ────────────────────────────────────────────

function buildFlags(evaluation: {
  phq9: ScoreResult;
  gad7: ScoreResult;
  dass21: DASS21Result;
  overallRiskLevel: RiskLevel;
}): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const { phq9, gad7, dass21 } = evaluation;

  // PHQ-9 flags
  if (phq9.severity.toLowerCase().includes('severe')) {
    flags.push({
      type: 'severe_depression',
      label: `Severe Depression (PHQ-9: ${phq9.score}/27)`,
      severity: 'critical',
    });
  } else if (phq9.severity.toLowerCase().includes('moderate')) {
    flags.push({
      type: 'moderate_depression',
      label: `Moderate Depression (PHQ-9: ${phq9.score}/27)`,
      severity: 'high',
    });
  }

  // GAD-7 flags
  if (gad7.severity.toLowerCase().includes('severe')) {
    flags.push({
      type: 'severe_anxiety',
      label: `Severe Anxiety (GAD-7: ${gad7.score}/21)`,
      severity: 'critical',
    });
  } else if (gad7.severity.toLowerCase().includes('moderate')) {
    flags.push({
      type: 'moderate_anxiety',
      label: `Moderate Anxiety (GAD-7: ${gad7.score}/21)`,
      severity: 'high',
    });
  }

  // DASS-21 stress flags
  const stress = dass21.stress;
  if (stress.severity.toLowerCase().includes('severe') || stress.severity.toLowerCase().includes('extremely severe')) {
    flags.push({
      type: 'severe_stress',
      label: `Severe Stress (DASS-21 Stress: ${stress.score}/42)`,
      severity: 'critical',
    });
  }

  // Count severe/critical domains
  const severeDomains = [
    phq9.isCritical,
    gad7.isCritical,
    dass21.depression.isCritical,
    dass21.anxiety.isCritical,
    dass21.stress.isCritical,
  ].filter(Boolean).length;

  if (severeDomains >= 2) {
    flags.push({
      type: 'multiple_severe_domains',
      label: `${severeDomains} severe domains detected`,
      severity: 'critical',
    });
  }

  // Immediate attention
  if (evaluation.overallRiskLevel === 'critical') {
    flags.push({
      type: 'immediate_attention',
      label: 'Student requires immediate attention',
      severity: 'critical',
    });
  }

  return flags;
}

function computeOverallRiskScore(domainResults: {
  phq9: ScoreResult;
  gad7: ScoreResult;
  dass21: DASS21Result;
}): number {
  let score = 0;

  // PHQ-9 contribution
  if (domainResults.phq9.score >= PHQ9_THRESHOLDS.MODERATE_SEVERE_MIN) {
    score += domainResults.phq9.isCritical
      ? PHQ9_THRESHOLDS.SEVERE_POINTS
      : PHQ9_THRESHOLDS.MODERATE_POINTS;
  }

  // GAD-7 contribution
  if (domainResults.gad7.score >= GAD7_THRESHOLDS.MODERATE_SEVERE_MIN) {
    score += domainResults.gad7.isCritical
      ? GAD7_THRESHOLDS.SEVERE_POINTS
      : GAD7_THRESHOLDS.MODERATE_POINTS;
  }

  // DASS-21 contribution (any subscale)
  const dassSevere = [
    domainResults.dass21.depression.score >= DASS21_THRESHOLDS.SEVERE_MIN,
    domainResults.dass21.anxiety.score >= DASS21_THRESHOLDS.SEVERE_MIN,
    domainResults.dass21.stress.score >= DASS21_THRESHOLDS.SEVERE_MIN,
  ];
  const dassModerate = [
    domainResults.dass21.depression.score >= DASS21_THRESHOLDS.MODERATE_MIN,
    domainResults.dass21.anxiety.score >= DASS21_THRESHOLDS.MODERATE_MIN,
    domainResults.dass21.stress.score >= DASS21_THRESHOLDS.MODERATE_MIN,
  ];

  if (dassSevere.some(Boolean)) {
    score += DASS21_THRESHOLDS.SEVERE_POINTS;
  } else if (dassModerate.some(Boolean)) {
    score += DASS21_THRESHOLDS.MODERATE_POINTS;
  }

  // Bonus for multiple severe domains
  const criticalDomains = [
    domainResults.phq9.isCritical,
    domainResults.gad7.isCritical,
    domainResults.dass21.depression.isCritical,
    domainResults.dass21.anxiety.isCritical,
    domainResults.dass21.stress.isCritical,
  ].filter(Boolean).length;

  if (criticalDomains >= 2) {
    score += MULTIPLE_SEVERE_BONUS;
  }

  return Math.min(score, MAX_COMPOSITE_SCORE);
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score <= OVERALL_RISK_THRESHOLDS.LOW_MAX) return 'low';
  if (score <= OVERALL_RISK_THRESHOLDS.MODERATE_MAX) return 'moderate';
  if (score <= OVERALL_RISK_THRESHOLDS.HIGH_MAX) return 'high';
  return 'critical';
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Evaluate assessment risk from a student's answers.
 *
 * Accepts answers keyed by question ID (e.g. { phq1: "2", phq2: "3", ... }).
 * Returns individual domain scores plus a composite risk evaluation.
 *
 * This is the single source of truth for all risk evaluation logic.
 */
export function evaluateAssessmentRisk(
  answers: Record<string, string>,
): RiskEvaluationResult {
  const phq9 = calculatePHQ9Score(answers);
  const gad7 = calculateGAD7Score(answers);
  const dass21 = calculateDASS21Score(answers);

  const domainResults = { phq9, gad7, dass21 };

  const overallRiskScore = computeOverallRiskScore(domainResults);
  const overallRiskLevel = riskLevelFromScore(overallRiskScore);
  const requiresImmediateAttention = overallRiskLevel === 'critical';

  const riskFlags = buildFlags({
    phq9,
    gad7,
    dass21,
    overallRiskLevel,
  });

  return {
    overallRiskLevel,
    overallRiskScore,
    requiresImmediateAttention,
    riskFlags,
    domainResults,
  };
}