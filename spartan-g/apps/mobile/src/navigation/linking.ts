import type { LinkingOptions, NavigatorScreenParams } from '@react-navigation/native';
import type {
  MobileAuthStackParamList,
  StudentMobileStackParamList,
  StudentMobileTabParamList,
  FacilitatorMobileStackParamList,
  FacilitatorMobileTabParamList,
} from '@spartan-g/shared-types';

// Linking's nested-screen inference requires React Navigation's state shape.
// Adapt the library-independent shared types without changing routes or URLs.
type LinkingRootParamList = {
  Auth: NavigatorScreenParams<MobileAuthStackParamList>;
  Student: NavigatorScreenParams<
    Omit<StudentMobileStackParamList, 'StudentTabs'> & {
      StudentTabs: NavigatorScreenParams<StudentMobileTabParamList>;
    }
  >;
  Facilitator: NavigatorScreenParams<
    Omit<FacilitatorMobileStackParamList, 'FacilitatorTabs'> & {
      FacilitatorTabs: NavigatorScreenParams<FacilitatorMobileTabParamList>;
    }
  >;
};

export const mobileLinking: LinkingOptions<LinkingRootParamList> = {
  prefixes: ['spartan-g://'],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          Register: 'register',
          WebOnlyRedirect: 'web-only',
        },
      },
      Student: {
        screens: {
          StudentTabs: {
            screens: {
              StudentHome: 'student',
              StudentCourses: 'student/courses',
              StudentAssignments: 'student/assignments',
              StudentMessages: 'student/messages',
              StudentProfile: 'student/profile',
            },
          },
          CourseDetail: 'student/course/:courseId',
          AssignmentDetail: 'student/assignment/:assignmentId',
          ConversationDetail: 'student/conversation/:conversationId',
          Forest: 'student/forest',
        },
      },
      Facilitator: {
        screens: {
          FacilitatorTabs: {
            screens: {
              FacilitatorDashboard: 'facilitator',
              Appointments: 'facilitator/appointments',
              Messaging: 'facilitator/messages',
              WorkHoursSchedule: 'facilitator/work-hours',
              FacilitatorProfile: 'facilitator/profile',
            },
          },
          AppointmentDetail: 'facilitator/appointment/:appointmentId',
          ConversationDetail: 'facilitator/conversation/:conversationId',
          ManageCourse: 'facilitator/course/:courseId',
          GradeSubmission: 'facilitator/submission/:submissionId',
        },
      },
    },
  },
};
