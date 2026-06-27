import { COLLECTIONS, FacilitatorStudentLinkDocument } from '@spartan-g/shared-types';
import { where, orderBy } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class FacilitatorStudentLinkRepository extends BaseRepository<FacilitatorStudentLinkDocument> {
  constructor() {
    super(COLLECTIONS.FACILITATOR_STUDENT_LINKS);
  }

  async getByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      orderBy('requestedAt', 'desc'),
    ]);
  }

  async getByStudent(studentId: string) {
    return this.getAll([
      where('studentId', '==', studentId),
      orderBy('requestedAt', 'desc'),
    ]);
  }

  async getPendingByFacilitator(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', '==', 'pending'),
      orderBy('requestedAt', 'desc'),
    ]);
  }

  async getAcceptedLinks(facilitatorId: string) {
    return this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('status', '==', 'accepted'),
      orderBy('requestedAt', 'desc'),
    ]);
  }

  async findLink(facilitatorId: string, studentId: string) {
    const results = await this.getAll([
      where('facilitatorId', '==', facilitatorId),
      where('studentId', '==', studentId),
    ]);
    return results.length > 0 ? results[0] : null;
  }
}

export const facilitatorStudentLinkRepository = new FacilitatorStudentLinkRepository();