import { Timestamp } from 'firebase/firestore';
import { FirestoreDocument } from './firestore.types';
import type { RiskLevel, RiskFlag } from '../utils/risk-evaluation';

// Question types supported by the wizard
export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';

export interface QuestionOption {
  id: string;        // e.g. 'a', 'b', 'c', 'd'
  label: string;     // Display text
}

export interface AssessmentQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: QuestionOption[];   // required for multiple_choice and true_false
  points: number;
  order: number;
}

/** Phase 3B — A course-based assessment definition (distinct from Phase 3A's AssessmentDocument). */
export interface AssessmentDefinitionDocument extends FirestoreDocument {
  courseId: string;
  title: string;
  description: string;
  instructions: string;
  questions: AssessmentQuestion[];
  timeLimitMinutes?: number;    // optional time limit
  maxAttempts: number;
  isPublished: boolean;
  facilitatorId: string;
  passingScore: number;         // percentage e.g. 70
}

// Student's answer to a single question
export interface AssessmentAnswer {
  questionId: string;
  value: string;                // selected option id or free text
  answeredAt: Timestamp;
}

// A student's attempt at an assessment
export type AttemptStatus = 'in_progress' | 'submitted' | 'graded';

export interface AssessmentAttemptDocument extends FirestoreDocument {
  assessmentId: string;
  studentId: string;
  answers: AssessmentAnswer[];
  status: AttemptStatus;
  startedAt: Timestamp;
  submittedAt?: Timestamp;
  score?: number;               // percentage, set after grading
  feedback?: string;
  attemptNumber: number;
  /** Risk evaluation metadata — set after submission if evaluation runs. */
  overallRiskLevel?: RiskLevel;
  overallRiskScore?: number;     // 0–100 composite
  riskFlags?: RiskFlag[];
}

// Wizard UI state (local, not persisted)
export interface WizardState {
  currentStep: number;           // 0-indexed question index; last step = review screen
  answers: Record<string, string>; // questionId → answer value
  isSubmitting: boolean;
  startedAt: Date;
}