import { LinkingOptions } from '@react-navigation/native';
import { MobileRootStackParamList } from '@spartan-g/shared-types';

export const mobileLinking: LinkingOptions<MobileRootStackParamList> = {
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
