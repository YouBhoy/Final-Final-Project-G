export const ROLES = {
  STUDENT: 'student',
  FACILITATOR: 'facilitator',
  SUPER_ADMIN: 'super_admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  [ROLES.STUDENT]: 'Student',
  [ROLES.FACILITATOR]: 'Facilitator',
  [ROLES.SUPER_ADMIN]: 'Super Admin',
};

export const ROLE_HIERARCHY: Record<Role, number> = {
  [ROLES.STUDENT]: 1,
  [ROLES.FACILITATOR]: 2,
  [ROLES.SUPER_ADMIN]: 3,
};
