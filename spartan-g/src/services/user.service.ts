import { ref, uploadBytes, getDownloadURL } from '@/firebase/storage';
import { getFirebaseStorage } from '@/firebase/storage';
import { STORAGE_PATHS } from '@/constants/collections';
import { userRepository, profileRepository } from '@/repositories';
import { ProfileDocument } from '@/types/user.types';
import { PERMISSIONS } from '@/constants/permissions';
import { Role } from '@/constants/roles';
import { hasPermission } from '@/auth/rbac';
import { PermissionError } from '@/utils/errors';

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
    return profileRepository.update(uid, data);
  }

  async uploadAvatar(uid: string, blob: Blob, fileName: string): Promise<string> {
    const storageRef = ref(getFirebaseStorage(), `${STORAGE_PATHS.AVATARS}/${uid}/${fileName}`);
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);
    await profileRepository.update(uid, { avatarUrl: url });
    return url;
  }

  async listUsersByRole(role: Role, actorRole: Role) {
    if (!hasPermission(actorRole, PERMISSIONS.MANAGE_USERS)) {
      throw new PermissionError();
    }
    return userRepository.getByRole(role);
  }
}

export const userService = new UserService();
