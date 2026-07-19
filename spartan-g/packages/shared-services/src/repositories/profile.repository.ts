import { COLLECTIONS, ProfileDocument } from '@spartan-g/shared-types';
import { BaseRepository } from './base.repository';
import { getFirestoreDb, setDoc, doc, serverTimestamp } from '../firebase/firestore';
import { RepositoryError } from '@spartan-g/shared-types';

class ProfileRepository extends BaseRepository<ProfileDocument> {
  constructor() {
    super(COLLECTIONS.PROFILES);
  }

  /**
   * Upsert (create-or-update) profile data. Uses setDoc with merge: true so it
   * works whether the document already exists or not — unlike updateDoc (the
   * default in BaseRepository.update()) which throws NOT_FOUND if the doc is
   * missing.
   *
   * This is intentionally scoped to ProfileRepository. Other repositories that
   * extend BaseRepository may rely on updateDoc failing when a document doesn't
   * exist (e.g. assessment_overrides where a missing doc is a real error).
   */
  async upsert(id: string, data: Partial<ProfileDocument>): Promise<void> {
    try {
      const sanitizedData = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      );

      await setDoc(
        doc(getFirestoreDb(), this.collectionName, id),
        {
          ...sanitizedData,
          uid: id,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (error) {
      throw new RepositoryError(`Failed to upsert ${this.collectionName}/${id}`, 'repo/upsert', error);
    }
  }
}

export const profileRepository = new ProfileRepository();