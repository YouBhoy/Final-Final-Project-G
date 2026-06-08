import { ROLES, Role, ROLE_HIERARCHY } from '../constants/roles';
import { PERMISSIONS, Permission, ROLE_PERMISSIONS } from '../constants/permissions';
import {
  PLATFORMS,
  Platform,
  PLATFORM_ROLE_ACCESS,
  DeploymentTarget,
} from '../constants/platforms';

export function getRolePermissions(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return getRolePermissions(role).includes(permission);
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function hasMinimumRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function isStudent(role: Role): boolean {
  return role === ROLES.STUDENT;
}

export function isFacilitator(role: Role): boolean {
  return role === ROLES.FACILITATOR;
}

export function isSuperAdmin(role: Role): boolean {
  return role === ROLES.SUPER_ADMIN;
}

export function canAccessPlatform(role: Role, platform: Platform): boolean {
  return PLATFORM_ROLE_ACCESS[platform].includes(role);
}

export function assertPlatformAccess(role: Role, platform: Platform): boolean {
  if (!canAccessPlatform(role, platform)) {
    return false;
  }
  return true;
}

/** Super Admin is web-only */
export function requiresWebPortal(role: Role): boolean {
  return role === ROLES.SUPER_ADMIN;
}

/** Returns whether the role can use the given deployment target */
export function canAccessDeploymentTarget(
  role: Role,
  platform: Platform,
  target: DeploymentTarget,
): boolean {
  if (!canAccessPlatform(role, platform)) return false;
  if (platform === PLATFORMS.MOBILE && role === ROLES.SUPER_ADMIN) return false;
  return true;
}

export { PERMISSIONS, ROLES, PLATFORMS };
