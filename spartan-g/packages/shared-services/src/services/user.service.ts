import { ref, uploadBytes, getDownloadURL } from '../firebase/storage';
import { getFirebaseStorage } from '../firebase/storage';
import {
  PERMISSIONS,
  ROLES,
  Role,
  Campus,
  UserDocument,
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

  /**
   * Update a user's assigned campus on their `users` and `profiles` docs.
   * Only the account owner (or a super admin) may change a campus.
   */
  async updateCampus(
    actorRole: Role,
    uid: string,
    campus: Campus,
    actorUid: string,
  ): Promise<void> {
    const canEditOthers = hasPermission(actorRole, PERMISSIONS.MANAGE_USERS);
    if (uid !== actorUid && !canEditOthers) {
      throw new PermissionError();
    }
    await userRepository.update(uid, { campus } as Partial<UserDocument>);
    await profileRepository.upsert(uid, { campus } as Partial<ProfileDocument>);
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

  /**
   * List active facilitators, optionally filtered to a single campus.
   * The filter is applied in-memory over the existing role + isActive query
   * so no extra Firestore composite index or security-rule change is needed.
   */
  async listFacilitatorsByCampus(actorRole: Role, campus?: Campus) {
    if (!roleHasAccess(actorRole)) {
      throw new PermissionError();
    }
    const users = await userRepository.getActiveByRole(ROLES.FACILITATOR);
    if (campus) {
      return users.filter((u) => u.campus === campus);
    }
    return users;
  }
}

function roleHasAccess(actorRole: Role): boolean {
  return (
    hasPermission(actorRole, PERMISSIONS.MANAGE_USERS) ||
    hasPermission(actorRole, PERMISSIONS.BOOK_APPOINTMENTS)
  );
}

export const userService = new UserService();