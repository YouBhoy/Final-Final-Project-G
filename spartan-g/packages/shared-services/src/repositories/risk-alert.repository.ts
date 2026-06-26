import { COLLECTIONS, RiskAlertDocument } from '@spartan-g/shared-types';
import { where, orderBy } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class RiskAlertRepository extends BaseRepository<RiskAlertDocument> {
  constructor() {
    super(COLLECTIONS.RISK_ALERTS);
  }

  async getByFacilitator(facilitatorId: string) {
    // Fetch all alerts and filter client-side to avoid composite index requirements.
    // Also handles legacy alerts that may have facilitatorId set to 'unknown'.
    const all = await this.getAll([]);
    return all.filter((a) => a.facilitatorId === facilitatorId);
  }

  async getOpenByFacilitator(facilitatorId: string) {
    // Fetch all alerts, filter by facilitator + open status client-side.
    const all = await this.getAll([]);
    return all.filter((a) => a.facilitatorId === facilitatorId && a.status === 'open');
  }

  /** Fetch all risk alerts for a specific student (for timeline views). */
  async getByStudent(studentId: string) {
    return this.getAll([
      where('studentId', '==', studentId),
      orderBy('createdAt', 'desc'),
    ]);
  }
}

export const riskAlertRepository = new RiskAlertRepository();
