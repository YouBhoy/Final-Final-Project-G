import { NavigatorScreenParams } from '@react-navigation/native';

// Auth stack — screens to be implemented
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

// Student stack — screens to be implemented
export type StudentTabParamList = {
  StudentHome: undefined;
  StudentCourses: undefined;
  StudentAssignments: undefined;
  StudentProfile: undefined;
};

export type StudentStackParamList = {
  StudentTabs: NavigatorScreenParams<StudentTabParamList>;
  CourseDetail: { courseId: string };
  AssignmentDetail: { assignmentId: string };
};

// Facilitator stack — screens to be implemented
export type FacilitatorTabParamList = {
  FacilitatorDashboard: undefined;
  FacilitatorCourses: undefined;
  FacilitatorStudents: undefined;
  FacilitatorProfile: undefined;
};

export type FacilitatorStackParamList = {
  FacilitatorTabs: NavigatorScreenParams<FacilitatorTabParamList>;
  ManageCourse: { courseId: string };
  GradeSubmission: { submissionId: string };
};

// Super Admin stack — screens to be implemented
export type SuperAdminTabParamList = {
  AdminDashboard: undefined;
  AdminUsers: undefined;
  AdminAnalytics: undefined;
  AdminSettings: undefined;
};

export type SuperAdminStackParamList = {
  SuperAdminTabs: NavigatorScreenParams<SuperAdminTabParamList>;
  UserDetail: { userId: string };
  PlatformSettings: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Student: NavigatorScreenParams<StudentStackParamList>;
  Facilitator: NavigatorScreenParams<FacilitatorStackParamList>;
  SuperAdmin: NavigatorScreenParams<SuperAdminStackParamList>;
};
