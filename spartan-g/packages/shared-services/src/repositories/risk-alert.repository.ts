import { COLLECTIONS, RiskAlertDocument } from '@spartan-g/shared-types';
import { where, orderBy } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class RiskAlertRepository extends BaseRepository<RiskAlertDocument> {
  constructor() {
    super(COLLECTIONS.RISK_ALERTS);
  }

  async getByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      orderBy('createdAt', 'desc'),
    ]);
  }

  async getOpenByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
    ]);
  }
}

export const riskAlertRepository = new RiskAlertRepository();
