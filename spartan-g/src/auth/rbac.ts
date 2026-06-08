import { ROLES, Role, ROLE_HIERARCHY } from '@/constants/roles';
import { PERMISSIONS, Permission, ROLE_PERMISSIONS } from '@/constants/permissions';

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

export function canAccessStudentArea(role: Role): boolean {
  return role === ROLES.STUDENT;
}

export function canAccessFacilitatorArea(role: Role): boolean {
  return role === ROLES.FACILITATOR || role === ROLES.SUPER_ADMIN;
}

export function canAccessSuperAdminArea(role: Role): boolean {
  return role === ROLES.SUPER_ADMIN;
}

export { PERMISSIONS };
