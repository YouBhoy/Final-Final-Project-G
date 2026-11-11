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
export function expandedNavigationLayout(portal: NavigationPortal, width: number, height: number, insets: { top: number; bottom: number; left: number; right: number }, fontScale = 1) {
  const usableWidth = Math.max(0, width - insets.left - insets.right);
  const textScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  // Reserve room for the complete longest label, including its pill padding.
  // Compact screens/large type use fewer columns rather than clipped words.
  const actionWidth = Math.min(Math.max(48, usableWidth - 32), Math.ceil(88 * textScale + 20));
  const actionHeight = Math.max(ACTION_HEIGHT, Math.ceil(62 + 14 * textScale));
  const x = actionWidth + 8;
  const columns = actionWidth * 3 + 16 <= usableWidth - 16 ? 3 : actionWidth * 2 + 8 <= usableWidth - 16 ? 2 : 1;
  const bottomPadding = Math.max(insets.bottom, 10);
  const originX = insets.left + usableWidth / 2;
  // Student's 64pt button floats 16pt above the dock; facilitator is unchanged.
  const centerOffset = navigationButtonCenter(portal);
  const originY = height - bottomPadding - NAVIGATION_ROW_HEIGHT + centerOffset;
  const bottom = Math.max(80, actionHeight / 2 + 32);
  const rowGap = actionHeight + 16;
  const top = columns === 3 ? Math.max(248, bottom + rowGap) : bottom + rowGap * (columns === 2 ? 1 : 3);
  const above = originY - insets.top - 12 - actionHeight / 2;
  const compact = above < top || usableWidth < 280;
  const positions = columns === 3
    ? [{ x: 0, y: -top }, { x: -x, y: -(top + bottom) / 2 }, { x, y: -(top + bottom) / 2 }, { x: 0, y: -bottom }]
    : columns === 2
      ? [{ x: -x / 2, y: -top }, { x: x / 2, y: -top }, { x: -x / 2, y: -bottom }, { x: x / 2, y: -bottom }]
      : [0, 1, 2, 3].map(index => ({ x: 0, y: -top + index * rowGap }));
  return { originX, originY, bottomPadding, actionWidth, actionHeight, columns, positions, compact, canvasHeight: top + actionHeight / 2 + 12 - centerOffset };
}
