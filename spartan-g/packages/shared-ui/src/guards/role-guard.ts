import {
  Role,
  Permission,
  hasPermission,
  hasMinimumRole,
  hasAllPermissions,
  hasAnyPermission,
} from '@spartan-g/shared-types';

export interface RoleGuardConfig {
  role: Role | null;
  requiredRole?: Role;
  requiredPermission?: Permission;
  requiredPermissions?: Permission[];
  requireAll?: boolean;
}

export function evaluateRoleGuard(config: RoleGuardConfig): boolean {
  const { role, requiredRole, requiredPermission, requiredPermissions, requireAll = false } = config;

  if (!role) return false;
  if (requiredRole && !hasMinimumRole(role, requiredRole)) return false;
  if (requiredPermission && !hasPermission(role, requiredPermission)) return false;

  if (requiredPermissions?.length) {
    return requireAll
      ? hasAllPermissions(role, requiredPermissions)
      : hasAnyPermission(role, requiredPermissions);
  }

  return true;
}
