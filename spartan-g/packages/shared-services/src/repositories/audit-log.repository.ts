import { COLLECTIONS, AuditLogDocument } from '@spartan-g/shared-types';
import { orderBy, limit } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class AuditLogRepository extends BaseRepository<AuditLogDocument> {
  constructor() {
    super(COLLECTIONS.AUDIT_LOGS);
  }

  /** Most recent entries first — Super Admin only (read rule). */
  async getRecent(max = 100) {
    return this.getAll([orderBy('createdAt', 'desc'), limit(max)]);
  }
}

export const auditLogRepository = new AuditLogRepository();
