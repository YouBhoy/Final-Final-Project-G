import { Timestamp } from 'firebase/firestore';
import { Role } from '../constants/roles';
import { DeploymentTarget } from '../constants/platforms';

export interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  photoURL?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProfileDocument {
  uid: string;
  bio?: string;
  phone?: string;
  institution?: string;
  avatarUrl?: string;
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
