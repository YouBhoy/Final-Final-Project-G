import { COLLECTIONS, CampusDocument } from '@spartan-g/shared-types';
import { where } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class CampusRepository extends BaseRepository<CampusDocument> {
  constructor() {
    super(COLLECTIONS.CAMPUSES);
  }

  async getAllCampuses() {
    const campuses = await this.getAll();
    return campuses.sort((a, b) => a.label.localeCompare(b.label));
  }

  async getActiveCampuses() {
    const campuses = await this.getAll([where('isActive', '==', true)]);
    return campuses.sort((a, b) => a.label.localeCompare(b.label));
  }
}

export const campusRepository = new CampusRepository();
