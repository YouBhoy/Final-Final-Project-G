import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from '@/firebase/auth';
import { getFirebaseAuth } from '@/firebase/auth';
import { ROLES } from '@/constants/roles';
import { AuthCredentials, RegisterPayload, AuthSession } from '@/types/auth.types';
import { UserDocument } from '@/types/user.types';
import { userRepository } from '@/repositories/user.repository';
import { profileRepository } from '@/repositories/profile.repository';
import { AuthError } from '@/utils/errors';

class AuthService {
  async signIn(credentials: AuthCredentials): Promise<AuthSession> {
    try {
      const { user } = await signInWithEmailAndPassword(
        getFirebaseAuth(),
        credentials.email,
        credentials.password,
      );
      return this.buildSession(user);
    } catch (error) {
      throw new AuthError('Sign in failed', 'auth/sign-in-failed', error);
    }
  }

  async register(payload: RegisterPayload): Promise<AuthSession> {
    try {
      const { user } = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        payload.email,
        payload.password,
      );

      await updateProfile(user, { displayName: payload.displayName });

      const role = payload.role ?? ROLES.STUDENT;
      const userDoc: Omit<UserDocument, 'createdAt' | 'updatedAt'> = {
        uid: user.uid,
        email: payload.email,
        displayName: payload.displayName,
        role,
        isActive: true,
      };

      await userRepository.create(user.uid, userDoc as UserDocument);
      await profileRepository.create(user.uid, { uid: user.uid } as never);

      return this.buildSession(user);
    } catch (error) {
      throw new AuthError('Registration failed', 'auth/register-failed', error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOut(getFirebaseAuth());
    } catch (error) {
      throw new AuthError('Sign out failed', 'auth/sign-out-failed', error);
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email);
    } catch (error) {
      throw new AuthError('Password reset failed', 'auth/reset-failed', error);
    }
  }

  async buildSession(firebaseUser: User): Promise<AuthSession> {
    const userDoc = await userRepository.getById(firebaseUser.uid);

    if (!userDoc) {
      throw new AuthError('User profile not found', 'auth/profile-not-found');
    }

    if (!userDoc.isActive) {
      throw new AuthError('Account is deactivated', 'auth/account-disabled');
    }

    return {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      emailVerified: firebaseUser.emailVerified,
      role: userDoc.role,
      displayName: firebaseUser.displayName ?? userDoc.displayName,
    };
  }
}

export const authService = new AuthService();
