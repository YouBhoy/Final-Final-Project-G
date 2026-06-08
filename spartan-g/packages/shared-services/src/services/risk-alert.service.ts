import {
  PERMISSIONS,
  Role,
  RiskAlertDocument,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import { riskAlertRepository } from '../repositories/risk-alert.repository';

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
