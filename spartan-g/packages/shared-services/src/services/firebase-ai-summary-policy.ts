// Summary eligibility only. Never computes or replaces assessment scores/risk.
export const SUMMARY_RISK_UNAVAILABLE_MESSAGE = 'Overall risk classification: UNKNOWN / unavailable. An AI risk interpretation has not been generated. The recorded assessment scores remain available for facilitator review.';
export const SUMMARY_RISK_POLICY_VERSION = 'unknown-abstention-v1';
export type SummaryAvailability = 'available' | 'risk_unavailable' | 'unavailable';
export function isSummaryRiskAvailable(metadata: { overallRiskLevel?: unknown; overallRiskScore?: unknown }): boolean {
  return ['low', 'moderate', 'high', 'critical'].includes(String(metadata.overallRiskLevel))
    && typeof metadata.overallRiskLevel === 'string'
    && typeof metadata.overallRiskScore === 'number' && Number.isFinite(metadata.overallRiskScore)
    && metadata.overallRiskScore >= 0 && metadata.overallRiskScore <= 100;
}
