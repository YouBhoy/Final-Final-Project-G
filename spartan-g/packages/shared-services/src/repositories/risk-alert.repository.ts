import { COLLECTIONS, RiskAlertDocument } from '@spartan-g/shared-types';
import { where, orderBy, limit, QueryConstraint } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class RiskAlertRepository extends BaseRepository<RiskAlertDocument> {
  constructor() {
    super(COLLECTIONS.RISK_ALERTS);
  }

  async getByFacilitator(facilitatorId: string, pagination?: { limitCount?: number; startAfter?: string }) {
    // Use server-side query with existing composite index (facilitatorId, status, createdAt)
    const constraints: QueryConstraint[] = [
      where('facilitatorId', '==', facilitatorId),
      orderBy('createdAt', 'desc'),
    ];
    if (pagination?.limitCount) {
      constraints.push(limit(pagination.limitCount));
    }
    return this.getAll(constraints);
  }

  async getOpenByFacilitator(facilitatorId: string, pagination?: { limitCount?: number; startAfter?: string }) {
    // Use server-side query with existing composite index
    const constraints: QueryConstraint[] = [
      where('facilitatorId', '==', facilitatorId),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
    ];
    if (pagination?.limitCount) {
      constraints.push(limit(pagination.limitCount));
    }
    return this.getAll(constraints);
  }

  /** Fetch all risk alerts for a specific student (for timeline views). */
  async getByStudent(studentId: string, pagination?: { limitCount?: number; startAfter?: string }) {
    const constraints: QueryConstraint[] = [
      where('studentId', '==', studentId),
      orderBy('createdAt', 'desc'),
    ];
    if (pagination?.limitCount) {
      constraints.push(limit(pagination.limitCount));
    }
    return this.getAll(constraints);
  }
}

export const riskAlertRepository = new RiskAlertRepository();