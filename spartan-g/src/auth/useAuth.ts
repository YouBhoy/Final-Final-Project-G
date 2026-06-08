import { useAuthStore } from '@/store/auth.store';
import { hasPermission, hasMinimumRole } from '@/auth/rbac';
import { Permission } from '@/constants/permissions';
import { Role } from '@/constants/roles';

export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const error = useAuthStore((s) => s.error);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const signIn = useAuthStore((s) => s.signIn);
  const register = useAuthStore((s) => s.register);
  const signOut = useAuthStore((s) => s.signOut);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const clearError = useAuthStore((s) => s.clearError);

  const isAuthenticated = status === 'authenticated' && session !== null;
  const isLoading = status === 'loading' || !isInitialized;
  const role = session?.role ?? null;

  const checkPermission = (permission: Permission) =>
    role ? hasPermission(role, permission) : false;

  const checkMinimumRole = (requiredRole: Role) =>
    role ? hasMinimumRole(role, requiredRole) : false;

  return {
    status,
    session,
    role,
    error,
    isAuthenticated,
    isLoading,
    signIn,
    register,
    signOut,
    resetPassword,
    clearError,
    hasPermission: checkPermission,
    hasMinimumRole: checkMinimumRole,
  };
}
