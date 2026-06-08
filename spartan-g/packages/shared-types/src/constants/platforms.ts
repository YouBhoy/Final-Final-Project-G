import { ROLES, Role } from './roles';

export const PLATFORMS = {
  MOBILE: 'mobile',
  WEB: 'web',
} as const;

export type Platform = (typeof PLATFORMS)[keyof typeof PLATFORMS];

export const DEPLOYMENT_TARGETS = {
  STUDENT_MOBILE: 'student_mobile',
  STUDENT_WEB: 'student_web',
  FACILITATOR_MOBILE: 'facilitator_mobile',
  FACILITATOR_WEB: 'facilitator_web',
  SUPER_ADMIN_WEB: 'super_admin_web',
} as const;

export type DeploymentTarget = (typeof DEPLOYMENT_TARGETS)[keyof typeof DEPLOYMENT_TARGETS];

/** Roles permitted on each runtime platform */
export const PLATFORM_ROLE_ACCESS: Record<Platform, readonly Role[]> = {
  [PLATFORMS.MOBILE]: [ROLES.STUDENT, ROLES.FACILITATOR],
  [PLATFORMS.WEB]: [ROLES.STUDENT, ROLES.FACILITATOR, ROLES.SUPER_ADMIN],
};

/** Maps deployment target to its role and platform */
export const DEPLOYMENT_TARGET_CONFIG: Record<
  DeploymentTarget,
  { role: Role; platform: Platform; label: string }
> = {
  [DEPLOYMENT_TARGETS.STUDENT_MOBILE]: {
    role: ROLES.STUDENT,
    platform: PLATFORMS.MOBILE,
    label: 'Student Mobile App',
  },
  [DEPLOYMENT_TARGETS.STUDENT_WEB]: {
    role: ROLES.STUDENT,
    platform: PLATFORMS.WEB,
    label: 'Student Web Portal',
  },
  [DEPLOYMENT_TARGETS.FACILITATOR_MOBILE]: {
    role: ROLES.FACILITATOR,
    platform: PLATFORMS.MOBILE,
    label: 'Facilitator Mobile App',
  },
  [DEPLOYMENT_TARGETS.FACILITATOR_WEB]: {
    role: ROLES.FACILITATOR,
    platform: PLATFORMS.WEB,
    label: 'Facilitator Web Portal',
  },
  [DEPLOYMENT_TARGETS.SUPER_ADMIN_WEB]: {
    role: ROLES.SUPER_ADMIN,
    platform: PLATFORMS.WEB,
    label: 'Super Admin Web Portal',
  },
};
