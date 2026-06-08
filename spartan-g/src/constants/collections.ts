export const COLLECTIONS = {
  USERS: 'users',
  PROFILES: 'profiles',
  COURSES: 'courses',
  ENROLLMENTS: 'enrollments',
  ASSIGNMENTS: 'assignments',
  SUBMISSIONS: 'submissions',
  NOTIFICATIONS: 'notifications',
  DEVICE_TOKENS: 'device_tokens',
  ANNOUNCEMENTS: 'announcements',
  AUDIT_LOGS: 'audit_logs',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const STORAGE_PATHS = {
  AVATARS: 'avatars',
  ASSIGNMENT_FILES: 'assignments',
  COURSE_MEDIA: 'courses',
} as const;
