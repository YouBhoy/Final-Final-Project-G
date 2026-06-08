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

  async setActive(uid: string, isActive: boolean) {
    return this.update(uid, { isActive } as Partial<UserDocument>);
  }
}

export const userRepository = new UserRepository();
