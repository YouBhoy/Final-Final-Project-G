import { type ReactNode } from 'react';

import { useAuth } from '@/auth/useAuth';
import { Permission } from '@/constants/permissions';
import { Role } from '@/constants/roles';
import { hasPermission, hasMinimumRole } from '@/auth/rbac';

interface RoleGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  requiredRole?: Role;
  requiredPermission?: Permission;
  requiredPermissions?: Permission[];
  requireAll?: boolean;
}

export function RoleGuard({
  children,
  fallback = null,
  requiredRole,
  requiredPermission,
  requiredPermissions,
  requireAll = false,
}: RoleGuardProps) {
  const { role } = useAuth();

  if (!role) return <>{fallback}</>;

  if (requiredRole && !hasMinimumRole(role, requiredRole)) {
    return <>{fallback}</>;
  }

  if (requiredPermission && !hasPermission(role, requiredPermission)) {
    return <>{fallback}</>;
  }

  if (requiredPermissions?.length) {
    const allowed = requireAll
      ? requiredPermissions.every((p) => hasPermission(role, p))
      : requiredPermissions.some((p) => hasPermission(role, p));
    if (!allowed) return <>{fallback}</>;
  }

  return <>{children}</>;
}
