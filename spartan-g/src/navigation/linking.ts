import { LinkingOptions } from '@react-navigation/native';

import { RootStackParamList } from '@/types/navigation.types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['spartan-g://', 'https://spartan-g.app'],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          Register: 'register',
          ForgotPassword: 'forgot-password',
        },
      },
      Student: {
        screens: {
          StudentTabs: {
            screens: {
              StudentHome: 'student',
              StudentCourses: 'student/courses',
              StudentAssignments: 'student/assignments',
              StudentProfile: 'student/profile',
            },
          },
          CourseDetail: 'student/course/:courseId',
          AssignmentDetail: 'student/assignment/:assignmentId',
        },
      },
      Facilitator: {
        screens: {
          FacilitatorTabs: {
            screens: {
              FacilitatorDashboard: 'facilitator',
              FacilitatorCourses: 'facilitator/courses',
              FacilitatorStudents: 'facilitator/students',
              FacilitatorProfile: 'facilitator/profile',
            },
          },
          ManageCourse: 'facilitator/course/:courseId',
          GradeSubmission: 'facilitator/submission/:submissionId',
        },
      },
      SuperAdmin: {
        screens: {
          SuperAdminTabs: {
            screens: {
              AdminDashboard: 'admin',
              AdminUsers: 'admin/users',
              AdminAnalytics: 'admin/analytics',
              AdminSettings: 'admin/settings',
            },
          },
          UserDetail: 'admin/user/:userId',
          PlatformSettings: 'admin/platform-settings',
        },
      },
    },
  },
};
