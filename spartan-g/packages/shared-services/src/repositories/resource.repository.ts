import { COLLECTIONS, ResourceAudience, ResourceDocument } from '@spartan-g/shared-types';
import { where, orderBy, limit } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class ResourceRepository extends BaseRepository<ResourceDocument> {
  constructor() {
    super(COLLECTIONS.RESOURCES);
  }

  /**
   * Published resources — the query Students/Facilitators run.
   * The `isActive == true` constraint is required for the Firestore
   * security rule (non-admin readers may only list published docs)
   * to be provable for the list operation.
   */
  async getPublished(audiences: ResourceAudience[]) {
    return this.getAll([
      where('isActive', '==', true),
      where('audience', 'in', audiences),
      orderBy('createdAt', 'desc'),
    ]);
  }

  /** Everything, newest first — Super Admin only (MANAGE_RESOURCES). */
  async getAllForAdmin(max = 200) {
    return this.getAll([orderBy('createdAt', 'desc'), limit(max)]);
  }
}

export const resourceRepository = new ResourceRepository();
