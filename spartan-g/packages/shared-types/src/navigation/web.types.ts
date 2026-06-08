// ─── Auth (web) ──────────────────────────────────────────────
export type WebAuthRouteParams = {
  login: undefined;
  register: undefined;
  'forgot-password': undefined;
  'mobile-only-redirect': undefined;
};

// ─── Student Web Portal ──────────────────────────────────────
export type StudentWebRoutes = {
  '/student': undefined;
  '/student/courses': undefined;
  '/student/courses/:courseId': { courseId: string };
  '/student/assignments': undefined;
  '/student/assignments/:assignmentId': { assignmentId: string };
  '/student/messages': undefined;
  '/student/messages/:conversationId': { conversationId: string };
  '/student/profile': undefined;
};

// ─── Facilitator Web Portal ──────────────────────────────────
export type FacilitatorWebRoutes = {
  '/facilitator': undefined;
  '/facilitator/courses': undefined;
  '/facilitator/courses/:courseId': { courseId: string };
  '/facilitator/students': undefined;
  '/facilitator/risk-alerts': undefined;
  '/facilitator/risk-alerts/:alertId': { alertId: string };
  '/facilitator/appointments': undefined;
  '/facilitator/appointments/:appointmentId': { appointmentId: string };
  '/facilitator/messages': undefined;
  '/facilitator/messages/:conversationId': { conversationId: string };
  '/facilitator/work-hours': undefined;
  '/facilitator/profile': undefined;
};

// ─── Super Admin Web Portal (web only) ───────────────────────
export type SuperAdminWebRoutes = {
  '/admin': undefined;
  '/admin/users': undefined;
  '/admin/users/:userId': { userId: string };
  '/admin/analytics': undefined;
  '/admin/settings': undefined;
  '/admin/audit-logs': undefined;
};

export type WebRoutePath =
  | keyof WebAuthRouteParams
  | keyof StudentWebRoutes
  | keyof FacilitatorWebRoutes
  | keyof SuperAdminWebRoutes;
