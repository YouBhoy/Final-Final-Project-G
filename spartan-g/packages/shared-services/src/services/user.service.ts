import { ref, uploadBytes, getDownloadURL } from '../firebase/storage';
import { getFirebaseStorage } from '../firebase/storage';
import {
  PERMISSIONS,
  ROLES,
  Role,
  ProfileDocument,
  STORAGE_PATHS,
  hasPermission,
  PermissionError,
} from '@spartan-g/shared-types';
import { userRepository, profileRepository } from '../repositories';

class UserService {
  async getUser(uid: string) {
    return userRepository.getById(uid);
  }

  async getProfile(uid: string) {
    return profileRepository.getById(uid);
  }

  async updateProfile(
    actorRole: Role,
    uid: string,
    data: Partial<ProfileDocument>,
    actorUid: string,
  ) {
    const canEditOthers = hasPermission(actorRole, PERMISSIONS.MANAGE_USERS);
    if (uid !== actorUid && !canEditOthers) {
      throw new PermissionError();
    }
    return profileRepository.upsert(uid, data);
  }

  async uploadAvatar(uid: string, blob: Blob, fileName: string): Promise<string> {
    const storageRef = ref(getFirebaseStorage(), `${STORAGE_PATHS.AVATARS}/${uid}/${fileName}`);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    await profileRepository.upsert(uid, { avatarUrl: url } as Partial<ProfileDocument>);
    return url;
  }

  async listUsersByRole(role: Role, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_USERS)) {
      if (role === ROLES.FACILITATOR && hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)) {
        // Use getActiveByRole so the query (role + isActive) matches the Firestore rule condition
        return userRepository.getActiveByRole(role);
      }
      throw new PermissionError();
    }
    return userRepository.getByRole(role);
  }
}

export const userService = new UserService();