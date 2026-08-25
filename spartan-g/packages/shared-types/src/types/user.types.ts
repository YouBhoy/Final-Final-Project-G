import { Timestamp } from 'firebase/firestore';
import { Role } from '../constants/roles';
import { Campus } from '../constants/campuses';
import { DeploymentTarget } from '../constants/platforms';

export type Gender = 'male' | 'female' | 'non_binary' | 'other' | 'prefer_not_to_say';

export interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  /** Assigned campus. Required for both Students and Facilitators. */
  campus: Campus;
  photoURL?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProfileDocument {
  uid: string;
  /** Assigned campus — mirrored on the profile for analytics and filtering. */
  campus?: Campus;
  bio?: string;
  phone?: string;
  institution?: string;
  avatarUrl?: string;
  pronouns?: string;
  gender?: Gender;
  metadata?: Record<string, unknown>;
  updatedAt: Timestamp;
}

export interface DeviceTokenDocument {
  uid: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  deploymentTarget: DeploymentTarget;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}