import {
  PERMISSIONS,
  Role,
  RiskAlertDocument,
  hasPermission,
  PermissionError,
  evaluateSubmittedRisk,
  type AssessmentAttemptDocument,
  type FacilitatorStudentLinkDocument,
  type RiskEvaluationResult,
} from '@spartan-g/shared-types';
import { riskAlertRepository } from '../repositories/risk-alert.repository';
import { Timestamp } from '../firebase/firestore';
import { getFirestoreDb } from '../firebase/firestore';
import { collection, doc, getDocsFromServer, query, runTransaction, where } from 'firebase/firestore';

class RiskAlertService {
  async getAlertsForFacilitator(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_RISK_ALERTS)) {
      throw new PermissionError();
    }
    return this.loadAssignedAlerts(facilitatorId);
  }

  async getOpenAlerts(facilitatorId: string, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.VIEW_RISK_ALERTS)) {
      throw new PermissionError();
    }
    return (await this.loadAssignedAlerts(facilitatorId)).filter(alert => alert.status === 'open');
  }

  /** Spark: review responses in the authorized facilitator session, not in the student client. */
  private async loadAssignedAlerts(facilitatorId: string): Promise<(RiskAlertDocument & { id: string })[]> {
    const db = getFirestoreDb();
    const links = await getDocsFromServer(query(collection(db, 'facilitator_student_links'),
      where('facilitatorId', '==', facilitatorId), where('status', '==', 'accepted')));
    const studentIds = [...new Set(links.docs.flatMap(row => {
      const link = row.data() as FacilitatorStudentLinkDocument;
      return row.id === `${facilitatorId}_${link.studentId}` ? [link.studentId] : [];
    }))];
    const results = await Promise.all(studentIds.map(async studentId => {
      const [attempts, saved] = await Promise.all([
        getDocsFromServer(query(collection(db, 'assessment_attempts'), where('studentId', '==', studentId), where('status', 'in', ['submitted', 'graded']))),
        getDocsFromServer(query(collection(db, 'risk_alerts'), where('facilitatorId', '==', facilitatorId), where('studentId', '==', studentId))),
      ]);
      const existing = saved.docs.map(row => ({ ...row.data(), id: row.id } as RiskAlertDocument & { id: string }));
      const alerts = existing.filter(alert => !alert.assessmentAttemptId);
      for (const row of attempts.docs) {
        const attempt = row.data() as AssessmentAttemptDocument;
        const evaluation = evaluateSubmittedRisk(attempt.answers);
        // A low result never inherits an old student-supplied risk label.
        if (evaluation?.overallRiskLevel === 'low') continue;
        const prior = existing.find(alert => alert.assessmentAttemptId === row.id);
        const id = prior?.id ?? `review_${facilitatorId}_${row.id}`;
        const calculated: RiskAlertDocument = {
          id, studentId, facilitatorId, assessmentAttemptId: row.id,
          status: 'open', createdAt: attempt.submittedAt ?? Timestamp.now(), updatedAt: Timestamp.now(),
          severity: evaluation ? (evaluation.overallRiskLevel === 'moderate' ? 'medium' : evaluation.overallRiskLevel) : 'medium',
          title: evaluation ? `${evaluation.overallRiskLevel.charAt(0).toUpperCase() + evaluation.overallRiskLevel.slice(1)} Risk` : 'Assessment requires review',
          description: evaluation ? `Risk score: ${evaluation.overallRiskScore}/100. ${evaluation.riskFlags.map(flag => flag.label).join('; ')}` : 'Responses are incomplete, invalid, or use an unsupported questionnaire. Review the submitted answers; no risk score has been assigned.',
          ...(evaluation ? { overallRiskScore: evaluation.overallRiskScore, riskFlags: evaluation.riskFlags } : {}),
        };
        const stored = prior ?? await runTransaction(db, async transaction => {
          const ref = doc(db, 'risk_alerts', id), snapshot = await transaction.get(ref);
          if (snapshot.exists()) return snapshot.data() as RiskAlertDocument;
          transaction.set(ref, calculated);
          return calculated;
        });
        // Preserve acknowledgement/resolution while always recomputing the displayed classification.
        alerts.push({ ...calculated, status: stored.status, createdAt: stored.createdAt ?? calculated.createdAt });
      }
      return alerts;
    }));
    return results.flat().sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
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
