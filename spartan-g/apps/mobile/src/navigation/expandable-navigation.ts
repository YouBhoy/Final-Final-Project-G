export type NavigationPortal = 'student' | 'facilitator';
export interface NavigationDestination { route: string; label: string; icon: 'home' | 'grid' | 'clipboard' | 'message-circle' | 'user' | 'feather' | 'calendar' | 'users' | 'clock' | 'book-open' }
export const NAVIGATION_DESTINATIONS: Record<NavigationPortal, { primary: readonly (NavigationDestination | null)[]; expanded: readonly NavigationDestination[] }> = {
  student: {
    primary: [
      { route: 'StudentHome', label: 'Home', icon: 'home' },
      { route: 'StudentAssignments', label: 'Assessments', icon: 'clipboard' },
      null,
      { route: 'StudentMessages', label: 'Messages', icon: 'message-circle' },
      { route: 'StudentProfile', label: 'Profile', icon: 'user' },
    ],
    expanded: [
      { route: 'StudentGarden', label: 'Garden', icon: 'feather' },
      { route: 'StudentAppointments', label: 'Appointments', icon: 'calendar' },
      { route: 'StudentCourses', label: 'Facilitator', icon: 'users' },
      { route: 'StudentResources', label: 'Resources', icon: 'book-open' },
    ],
  },
  facilitator: {
    primary: [
      { route: 'FacilitatorDashboard', label: 'Home', icon: 'grid' }, null,
      { route: 'FacilitatorProfile', label: 'Profile', icon: 'user' },
    ],
    expanded: [
      { route: 'AssessmentOverrides', label: 'Students', icon: 'users' },
      { route: 'Appointments', label: 'Appointments', icon: 'calendar' },
      { route: 'Messaging', label: 'Chats', icon: 'message-circle' },
      { route: 'WorkHoursSchedule', label: 'Hours', icon: 'clock' },
    ],
  },
};

export const NAVIGATION_ROW_HEIGHT = 76;
export const ACTION_HEIGHT = 96;
export const STUDENT_DOCK_LIFT = 22;
export const navigationButtonCenter = (portal: NavigationPortal) => portal === 'student' ? 16 : 28;
export const navigationBarHeight = (bottomInset: number) => NAVIGATION_ROW_HEIGHT + Math.max(bottomInset, 10);

/** Coordinates refer to the centre of an action's complete 48pt icon + label target. */
export function expandedNavigationLayout(portal: NavigationPortal, width: number, height: number, insets: { top: number; bottom: number; left: number; right: number }) {
  const usableWidth = Math.max(0, width - insets.left - insets.right);
  const actionWidth = Math.min(96, Math.max(64, Math.floor((usableWidth - 32) / 3)));
  const x = actionWidth + 8;
  const bottomPadding = Math.max(insets.bottom, 10);
  const originX = insets.left + usableWidth / 2;
  // Student's 64pt button floats 16pt above the dock; facilitator is unchanged.
  const centerOffset = navigationButtonCenter(portal);
  const originY = height - bottomPadding - NAVIGATION_ROW_HEIGHT + centerOffset;
  const above = originY - insets.top - 12 - ACTION_HEIGHT / 2;
  const compact = above < (portal === 'student' ? 250 : 180) || usableWidth < 280;
  const top = compact ? 248 : Math.min(248, above);
  const positions = [{ x: 0, y: -top }, { x: -x, y: -(top + 80) / 2 }, { x, y: -(top + 80) / 2 }, { x: 0, y: -80 }];
  return { originX, originY, bottomPadding, actionWidth, positions, compact, canvasHeight: top + ACTION_HEIGHT / 2 + 12 - centerOffset };
}
