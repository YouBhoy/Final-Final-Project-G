import { where } from '@/firebase/firestore';
import { COLLECTIONS } from '@/constants/collections';
import { DeviceTokenDocument } from '@/types/user.types';

import { BaseRepository } from './base.repository';

class DeviceTokenRepository extends BaseRepository<DeviceTokenDocument> {
  constructor() {
    super(COLLECTIONS.DEVICE_TOKENS);
  }

  async getByUserId(uid: string) {
    return this.getAll([where('uid', '==', uid)]);
  }
}

export const deviceTokenRepository = new DeviceTokenRepository();
