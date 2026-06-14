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
  // Facilitator feature collections
  RISK_ALERTS: 'risk_alerts',
  APPOINTMENTS: 'appointments',
  CONVERSATIONS: 'conversations',
  MESSAGES: 'messages',
  WORK_HOURS_SCHEDULES: 'work_hours_schedules',
  // Assessment feature collections (Phase 3A)
  ASSESSMENT_TEMPLATES: 'assessment_templates',
  ASSESSMENT_QUESTIONS: 'assessment_questions',
  ASSESSMENTS: 'assessments',
  ASSESSMENT_RESPONSES: 'assessment_responses',
  // Assessment feature collections (Phase 3B)
  ASSESSMENT_ATTEMPTS: 'assessment_attempts',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const STORAGE_PATHS = {
  AVATARS: 'avatars',
  ASSIGNMENT_FILES: 'assignments',
  COURSE_MEDIA: 'courses',
  MESSAGE_ATTACHMENTS: 'messages',
} as const;