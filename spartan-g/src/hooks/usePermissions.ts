import { useAuth } from '@/auth/useAuth';
import { Permission } from '@/constants/permissions';
import { hasAllPermissions, hasAnyPermission } from '@/auth/rbac';

export function usePermissions() {
  const { role } = useAuth();

  const can = (permission: Permission) => (role ? hasAnyPermission(role, [permission]) : false);

  const canAll = (permissions: Permission[]) =>
    role ? hasAllPermissions(role, permissions) : false;

  const canAny = (permissions: Permission[]) =>
    role ? hasAnyPermission(role, permissions) : false;

  return { can, canAll, canAny, role };
}
