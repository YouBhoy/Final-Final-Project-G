/** Minimal param-list helper — avoids coupling shared-types to React Navigation */
export type NavigatorScreenParams<T extends Record<string, object | undefined>> = {
  screen?: keyof T;
  params?: T[keyof T];
  initial?: boolean;
  path?: string;
  state?: object;
};

// ─── Auth (mobile) ───────────────────────────────────────────
export type MobileAuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  WebOnlyRedirect: undefined;
};

// ─── Student Mobile ──────────────────────────────────────────
export type StudentMobileTabParamList = {
  StudentHome: undefined;
  StudentCourses: undefined;
  StudentAssignments: undefined;
  StudentMessages: undefined;
  StudentProfile: undefined;
};

export type StudentMobileStackParamList = {
  StudentTabs: NavigatorScreenParams<StudentMobileTabParamList>;
  CourseDetail: { courseId: string };
  AssignmentDetail: { assignmentId: string };
  ConversationDetail: { conversationId: string };
  AssessmentWizard: { assessmentId: string };
  BookAppointment: { facilitatorId: string };
  StudentAppointments: undefined;
};

// ─── Facilitator Mobile ──────────────────────────────────────
export type FacilitatorMobileTabParamList = {
  FacilitatorDashboard: undefined;
  Appointments: undefined;
  Messaging: undefined;
  WorkHoursSchedule: undefined;
  AssessmentOverrides: undefined;
  FacilitatorProfile: undefined;
};

export type FacilitatorMobileStackParamList = {
  FacilitatorTabs: NavigatorScreenParams<FacilitatorMobileTabParamList>;
  FacilitatorAssessmentsList: undefined;
  FacilitatorStudentsList: { studentId?: string };
  FacilitatorSlotsList: undefined;
  AppointmentDetail: { appointmentId: string };
  ConversationDetail: { conversationId: string };
  ManageCourse: { courseId: string };
  GradeSubmission: { submissionId: string };
  AssessmentOverrideDetail: { assessmentId: string; studentId: string };
  StudentDetail: { studentId: string; assessmentId: string };
};

export type MobileRootStackParamList = {
  Auth: NavigatorScreenParams<MobileAuthStackParamList>;
  Student: NavigatorScreenParams<StudentMobileStackParamList>;
  Facilitator: NavigatorScreenParams<FacilitatorMobileStackParamList>;
};