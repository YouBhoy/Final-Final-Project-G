import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  User,
} from '../firebase/auth';
import { getFirebaseAuth } from '../firebase/auth';
import {
  ROLES,
  AuthCredentials,
  RegisterPayload,
  AuthSession,
  AuthError,
  Platform,
  canAccessPlatform,
  PlatformAccessError,
} from '@spartan-g/shared-types';
import { userRepository } from '../repositories/user.repository';
import { profileRepository } from '../repositories/profile.repository';
import { UserDocument } from '@spartan-g/shared-types';

/** Maps low-level Firebase auth errors to human-friendly banner messages. */
function friendlyAuthMessage(error: unknown, fallback: string): string {
  const raw = error as { code?: string; message?: string; cause?: { code?: string } };
  const code = raw?.code ?? raw?.cause?.code ?? '';
  if (typeof code === 'string') {
    if (code.includes('email-already-in-use') || code.includes('EMAIL_EXISTS')) {
      return 'An account with this email already exists.';
    }
    if (
      code.includes('invalid-credential') ||
      code.includes('invalid-login-credentials') ||
      code.includes('wrong-password') ||
      code.includes('user-not-found')
    ) {
      return 'Invalid email or password.';
    }
    if (code.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
    if (code.includes('network-request-failed')) return 'Network error. Check your internet connection and try again.';
    if (code.includes('weak-password')) return 'Password must be at least 6 characters.';
    if (code.includes('campus-required')) return 'Please select your campus.';
  }
  return fallback;
}

class AuthService {
  async signIn(credentials: AuthCredentials, platform: Platform): Promise<AuthSession> {
    try {
      const { user } = await signInWithEmailAndPassword(
        getFirebaseAuth(),
        credentials.email,
        credentials.password,
      );
      const session = await this.buildSession(user);
      this.assertPlatformAccess(session.role, platform);
      return session;
    } catch (error) {
      if (error instanceof PlatformAccessError) throw error;
      throw new AuthError(friendlyAuthMessage(error, 'Sign in failed. Please try again.'), 'auth/sign-in-failed', error);
    }
  }

  async register(payload: RegisterPayload, platform: Platform): Promise<AuthSession> {
    try {
      const role = payload.role ?? ROLES.STUDENT;
      if (!canAccessPlatform(role, platform)) {
        throw new PlatformAccessError('This role cannot be registered on this platform');
      }

      if (!payload.campus) {
        throw new AuthError('Please select your campus.', 'auth/campus-required');
      }

      const { user } = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        payload.email,
        payload.password,
      );

      await updateProfile(user, { displayName: payload.displayName });

      const userDoc: Omit<UserDocument, 'createdAt' | 'updatedAt'> = {
        uid: user.uid,
        email: payload.email,
        displayName: payload.displayName,
        role,
        campus: payload.campus,
        isActive: true,
      };

      await userRepository.create(user.uid, userDoc as UserDocument);
      await profileRepository.create(user.uid, { uid: user.uid, campus: payload.campus } as never);

      return this.buildSession(user);
    } catch (error) {
      if (error instanceof PlatformAccessError) throw error;
      throw new AuthError(friendlyAuthMessage(error, 'Registration failed. Please try again.'), 'auth/register-failed', error);
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
      campus: (userDoc as UserDocument).campus ?? null,
    };
  }

  assertPlatformAccess(role: AuthSession['role'], platform: Platform): void {
    if (!canAccessPlatform(role, platform)) {
      throw new PlatformAccessError(
        platform === 'mobile' && role === ROLES.SUPER_ADMIN
          ? 'Super Admin access is available on the web portal only'
          : 'Your role is not available on this platform',
      );
    }
  }
}

export const authService = new AuthService();
