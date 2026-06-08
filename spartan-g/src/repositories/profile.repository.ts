import { COLLECTIONS } from '@/constants/collections';
import { ProfileDocument } from '@/types/user.types';

import { BaseRepository } from './base.repository';

class ProfileRepository extends BaseRepository<ProfileDocument> {
  constructor() {
    super(COLLECTIONS.PROFILES);
  }
}

export const profileRepository = new ProfileRepository();
