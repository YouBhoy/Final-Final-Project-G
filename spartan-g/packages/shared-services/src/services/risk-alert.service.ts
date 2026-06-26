import {
  PERMISSIONS,
  Role,
  RiskAlertDocument,
  hasPermission,
  PermissionError,
  type RiskEvaluationResult,
} from '@spartan-g/shared-types';
import { riskAlertRepository } from '../repositories/risk-alert.repository';
import { Timestamp } from '../firebase/firestore';

class RiskAlertService {
  async getAlertsForFacilitator(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_RISK_ALERTS)) {
      throw new PermissionError();
    }
    return riskAlertRepository.getByFacilitator(facilitatorId);
  }

  async getOpenAlerts(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_RISK_ALERTS)) {
      throw new PermissionError();
    }
    return riskAlertRepository.getOpenByFacilitator(facilitatorId);
  }

  async acknowledgeAlert(alertId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_RISK_ALERTS)) {
      throw new PermissionError();
    }
    return riskAlertRepository.update(alertId, { status: 'acknowledged' } as Partial<RiskAlertDocument>);
  }

  async resolveAlert(alertId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_RISK_ALERTS)) {
      throw new PermissionError();
    }
    return riskAlertRepository.update(alertId, { status: 'resolved' } as Partial<RiskAlertDocument>);
  }

  /**
   * Create a risk alert from an assessment risk evaluation.
   * Called automatically after attempt submission when thresholds are met.
   */
  async createAlert(params: {
    studentId: string;
    facilitatorId: string;
    assessmentAttemptId: string;
    evaluation: RiskEvaluationResult;
  }): Promise<string> {
    const { studentId, facilitatorId, assessmentAttemptId, evaluation } = params;

    const severityMap: Record<string, RiskAlertDocument['severity']> = {
      critical: 'critical',
      high: 'high',
      moderate: 'medium',
      low: 'low',
    };

    const alertId = `alert_${studentId}_${assessmentAttemptId}_${Date.now()}`;
    const flagDescriptions = evaluation.riskFlags.map((f) => `${f.label}`).join('; ');

    await riskAlertRepository.create(alertId, {
      studentId,
      facilitatorId,
      severity: severityMap[evaluation.overallRiskLevel] ?? 'medium',
      title: `${evaluation.overallRiskLevel.charAt(0).toUpperCase() + evaluation.overallRiskLevel.slice(1)} Risk — ${evaluation.domainResults.phq9.severity}`,
      description: `Risk score: ${evaluation.overallRiskScore}/100. ${flagDescriptions}`,
      status: 'open',
      assessmentAttemptId,
      overallRiskScore: evaluation.overallRiskScore,
      riskFlags: evaluation.riskFlags.map((f) => ({
        type: f.type,
        label: f.label,
        severity: f.severity,
      })),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    } as unknown as RiskAlertDocument & { id: string });

    return alertId;
  }

  subscribeToAlerts(facilitatorId: string, actorRole: Role, callback: (alerts: (RiskAlertDocument & { id: string })[]) => void) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_RISK_ALERTS)) {
      throw new PermissionError();
    }
    return riskAlertRepository.subscribeQuery(
      [],
      callback,
    );
  }
}

export const riskAlertService = new RiskAlertService();
