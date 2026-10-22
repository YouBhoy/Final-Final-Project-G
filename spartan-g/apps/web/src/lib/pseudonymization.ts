import type { AuditLogDocument, UserDocument } from '@spartan-g/shared-types';

/** Random aliases are scoped to one report load. No UID-derived hash or stored lookup table. */
export function createPseudonymizer() {
  const aliases = new Map<string, string>();
  const used = new Set<string>();
  return (namespace: string, identity: string): string => {
    const key = JSON.stringify([namespace, identity]);
    const existing = aliases.get(key);
    if (existing) return existing;
    let alias: string;
    do {
      alias = `${namespace}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    } while (used.has(alias));
    aliases.set(key, alias);
    used.add(alias);
    return alias;
  };
}

const accountAliases = createPseudonymizer();
export const adminStudentAlias = (uid: string) => accountAliases('Student', uid);
export type AdminUserListRow = Pick<UserDocument, 'role' | 'campus' | 'isActive' | 'displayName' | 'email'> & { id: string };

/** Student identities are removed before sorting, searching or storing directory rows. */
export function adminUserListRows(users: (UserDocument & { id: string })[]): AdminUserListRow[] {
  return users.map(user => ({
    id: user.id, role: user.role, campus: user.campus, isActive: user.isActive,
    displayName: user.role === 'student' ? adminStudentAlias(user.id) : user.displayName,
    email: user.role === 'student' ? 'Identity hidden' : user.email,
  }));
}

export type AuditDisplayRow = Pick<AuditLogDocument, 'id' | 'action' | 'createdAt'> & {
  actorLabel: string;
  targetLabel: string;
  targetType: string;
  changedFields: string[];
};
const accountResources = new Set(['users', 'profiles', 'auth', 'assessment_overrides']);
const safeFields = new Set(['displayName', 'campus', 'isActive', 'role', 'password', 'email', 'assessmentId', 'expiresAt', 'reason']);

/** Drop raw identifiers and free-text metadata before putting audit rows in component state. */
export function pseudonymizeAuditRows(rows: AuditLogDocument[]): AuditDisplayRow[] {
  const alias = createPseudonymizer();
  return rows.map(row => ({
    id: alias('Event', row.id),
    action: row.action,
    createdAt: row.createdAt,
    actorLabel: row.actorId ? alias('Account', row.actorId) : 'Unknown account',
    targetLabel: row.resourceId ? alias(accountResources.has(row.resource) ? 'Account' : 'Record', row.resourceId) : 'Unknown target',
    targetType: row.resource,
    changedFields: Array.isArray(row.metadata?.changedFields)
      ? row.metadata.changedFields.filter((field): field is string => typeof field === 'string' && safeFields.has(field)) : [],
  }));
}
