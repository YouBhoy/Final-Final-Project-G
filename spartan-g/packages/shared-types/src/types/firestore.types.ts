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
