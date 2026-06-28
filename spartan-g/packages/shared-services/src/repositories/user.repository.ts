import { COLLECTIONS } from '@spartan-g/shared-types';
import { UserDocument } from '@spartan-g/shared-types';
import { where } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class UserRepository extends BaseRepository<UserDocument> {
  constructor() {
    super(COLLECTIONS.USERS);
  }

  async getByEmail(email: string) {
    const users = await this.getAll([where('email', '==', email)]);
    return users[0] ?? null;
  }

  async getByRole(role: UserDocument['role']) {
    return this.getAll([where('role', '==', role)]);
  }

  /** Fetch all active users with a given role. The isActive filter matches
   *  the Firestore security rule condition so the query isn't rejected. */
  async getActiveByRole(role: UserDocument['role']) {
    return this.getAll([
      where('role', '==', role),
      where('isActive', '==', true),
    ]);
  }

  async setActive(uid: string, isActive: boolean) {
    return this.update(uid, { isActive } as Partial<UserDocument>);
  }

  /** Fetch all active student users, sorted in-memory by displayName to avoid composite index requirement. */
  async getAllStudents(): Promise<(UserDocument & { id: string })[]> {
    const results = await this.getAll([
      where('role', '==', 'student'),
      where('isActive', '==', true),
    ]);
    results.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
    return results;
  }
}

export const userRepository = new UserRepository();