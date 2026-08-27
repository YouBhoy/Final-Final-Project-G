import { COLLECTIONS, DeviceTokenDocument } from '@spartan-g/shared-types';
import { where } from '../firebase/firestore';
import { BaseRepository } from './base.repository';

class DeviceTokenRepository extends BaseRepository<DeviceTokenDocument> {
  constructor() {
    super(COLLECTIONS.DEVICE_TOKENS);
  }

  async getByUserId(uid: string) {
    return this.getAll([where('uid', '==', uid)]);
  }

  /**
   * Find every token document that claims a given physical-device push token.
   * An Expo push token identifies the app install, not the user, so at most one
   * owner should exist at a time — see NotificationService.registerDevice.
   */
  async getByToken(token: string) {
    return this.getAll([where('token', '==', token)]);
  }

  /**
   * Remove every document claiming the given token (used when a new account
   * takes over the device) or all of a user's documents (used on sign-out).
   */
  async deleteAll(docs: (DeviceTokenDocument & { id: string })[]) {
    await Promise.all(docs.map((d) => this.delete(d.id)));
  }
}

export const deviceTokenRepository = new DeviceTokenRepository();
