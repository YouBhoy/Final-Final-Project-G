import { Timestamp } from 'firebase/firestore';

export interface FirestoreDocument {
  id: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface CourseDocument extends FirestoreDocument {
  title: string;
  description: string;
  facilitatorId: string;
  isPublished: boolean;
  tags: string[];
}

export interface EnrollmentDocument extends FirestoreDocument {
  courseId: string;
  studentId: string;
  status: 'active' | 'completed' | 'dropped';
  enrolledAt: Timestamp;
}

export interface AssignmentDocument extends FirestoreDocument {
  courseId: string;
  title: string;
  description: string;
  dueAt: Timestamp;
  maxScore: number;
}

export interface SubmissionDocument extends FirestoreDocument {
  assignmentId: string;
  studentId: string;
  fileUrl?: string;
  content?: string;
  score?: number;
  feedback?: string;
  submittedAt: Timestamp;
}

export interface NotificationDocument extends FirestoreDocument {
  userId: string;
  title: string;
  body: string;
  type: 'info' | 'alert' | 'assignment' | 'grade' | 'risk' | 'appointment' | 'work_hours';
  isRead: boolean;
  data?: Record<string, string>;
}

export interface AnnouncementDocument extends FirestoreDocument {
  title: string;
  body: string;
  authorId: string;
  targetRoles: string[];
  isActive: boolean;
}

export interface AuditLogDocument extends FirestoreDocument {
  actorId: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}

export interface RiskAlertDocument extends FirestoreDocument {
  studentId: string;
  facilitatorId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  status: 'open' | 'acknowledged' | 'resolved';
}

export interface AppointmentDocument extends FirestoreDocument {
  studentId: string;
  facilitatorId: string;
  scheduledAt: Timestamp;
  durationMinutes: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  notifyBeforeMinutes: number;
}

export interface ConversationDocument extends FirestoreDocument {
  participantIds: string[];
  lastMessageAt: Timestamp;
  lastMessagePreview: string;
}

export interface MessageDocument extends FirestoreDocument {
  conversationId: string;
  senderId: string;
  body: string;
  attachmentUrl?: string;
  isRead: boolean;
}

export interface WorkHoursScheduleDocument extends FirestoreDocument {
  facilitatorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notifyBeforeMinutes: number;
}

/** Phase 3A — Assessment feature documents. */
export type AssessmentCategory = string;

export type AssessmentQuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multi_choice'
  | 'scale_1_5'
  | 'scale_1_10'
  | 'yes_no';

export type AssessmentStatus = 'in_progress' | 'submitted';

export interface AssessmentTemplateDocument extends FirestoreDocument {
  title: string;
  description: string;
  category: AssessmentCategory;
  version: number;
  isActive: boolean;
  createdBy: string;
  /** Denormalized count of questions for fast list rendering. */
  questionCount: number;
}

export interface AssessmentQuestionDocument extends FirestoreDocument {
  templateId: string;
  order: number;
  prompt: string;
  type: AssessmentQuestionType;
  options?: string[];
  isRequired: boolean;
}

export interface AssessmentDocument extends FirestoreDocument {
  templateId: string;
  studentId: string;
  status: AssessmentStatus;
  submittedAt?: Timestamp;
  responseCount: number;
  /** Future: facilitatorId for Phase 3C review assignment. */
  reviewedBy?: string;
  reviewStatus?: 'pending_review' | 'reviewed';
  reviewNotes?: string;
}

/** Phase 3B — Assessment response capture. */
export type AssessmentResponseValue = string | string[] | number;

export interface AssessmentResponseDocument extends FirestoreDocument {
  assessmentId: string;
  questionId: string;
  studentId: string;
  value: AssessmentResponseValue;
  /** Future: per-question scoring for facilitator review (Phase 3C). */
  score?: number;
  feedback?: string;
}