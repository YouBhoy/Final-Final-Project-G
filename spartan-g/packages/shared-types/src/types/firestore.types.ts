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
  type: 'info' | 'alert' | 'assignment' | 'grade' | 'risk' | 'message' | 'appointment' | 'work_hours' | 'reschedule';
  isRead: boolean;
  data?: Record<string, string>;
  relatedId?: string;
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
  /** Link to the assessment attempt that triggered this alert. */
  assessmentAttemptId?: string;
  /** Composite risk score (0–100) at time of alert creation. */
  overallRiskScore?: number;
  /** Structured risk flags explaining why the alert was generated. */
  riskFlags?: { type: string; label: string; severity: string }[];
}

export interface AppointmentDocument extends FirestoreDocument {
  studentId: string;
  facilitatorId: string;
  scheduledAt: Timestamp;
  durationMinutes: number;
  status: 'requested' | 'accepted' | 'completed' | 'cancelled' | 'rejected' | 'no_show' | 'reschedule_requested';
  notes?: string;
  facilitatorNotes?: string;
  outcomeNotes?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  rescheduleReason?: string;
  rescheduleRequestedAt?: Timestamp;
  acceptedAt?: Timestamp;
  completedAt?: Timestamp;
  notifyBeforeMinutes: number;
}

export interface FacilitatorStudentLinkDocument extends FirestoreDocument {
  facilitatorId: string;
  studentId: string;
  status: 'pending' | 'accepted' | 'rejected';
  requestedAt: Timestamp;
  respondedAt?: Timestamp;
  notes?: string;
}

export interface ConversationDocument extends FirestoreDocument {
  participantIds: string[];
  lastMessageAt: Timestamp;
  lastMessagePreview: string;
  /** Per-participant unread message count, keyed by user UID. */
  unreadCount?: Record<string, number>;
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
  /**
   * Monday (00:00 local) of the week this schedule belongs to. Work hours are
   * per-week — only the current week's schedules are active/bookable.
   */
  weekStartDate: Timestamp;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
  notifyBeforeMinutes: number;
}

export interface AppointmentSlotDocument extends FirestoreDocument {
  facilitatorId: string;
  startTime: Timestamp;
  endTime: Timestamp;
  status: 'available' | 'reserved' | 'completed' | 'cancelled';
  appointmentId?: string;
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