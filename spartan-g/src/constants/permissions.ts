import { ROLES, Role } from './roles';

export const PERMISSIONS = {
  // Profile
  VIEW_OWN_PROFILE: 'view_own_profile',
  EDIT_OWN_PROFILE: 'edit_own_profile',

  // Courses & learning
  VIEW_COURSES: 'view_courses',
  ENROLL_COURSE: 'enroll_course',
  SUBMIT_ASSIGNMENT: 'submit_assignment',

  // Facilitation
  MANAGE_STUDENTS: 'manage_students',
  GRADE_ASSIGNMENTS: 'grade_assignments',
  CREATE_COURSE_CONTENT: 'create_course_content',
  VIEW_FACILITATOR_DASHBOARD: 'view_facilitator_dashboard',

  // Administration
  MANAGE_USERS: 'manage_users',
  MANAGE_ROLES: 'manage_roles',
  VIEW_SYSTEM_ANALYTICS: 'view_system_analytics',
  MANAGE_PLATFORM_SETTINGS: 'manage_platform_settings',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [ROLES.STUDENT]: [
    PERMISSIONS.VIEW_OWN_PROFILE,
    PERMISSIONS.EDIT_OWN_PROFILE,
    PERMISSIONS.VIEW_COURSES,
    PERMISSIONS.ENROLL_COURSE,
    PERMISSIONS.SUBMIT_ASSIGNMENT,
  ],
  [ROLES.FACILITATOR]: [
    PERMISSIONS.VIEW_OWN_PROFILE,
    PERMISSIONS.EDIT_OWN_PROFILE,
    PERMISSIONS.VIEW_COURSES,
    PERMISSIONS.MANAGE_STUDENTS,
    PERMISSIONS.GRADE_ASSIGNMENTS,
    PERMISSIONS.CREATE_COURSE_CONTENT,
    PERMISSIONS.VIEW_FACILITATOR_DASHBOARD,
  ],
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
};
