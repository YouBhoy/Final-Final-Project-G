import type { Role } from "@spartan-g/shared-types";

/**
 * A lightweight notification shape used by the UI (subsets of
 * NotificationDocument plus the doc id).
 */
export interface UiNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  relatedId?: string;
  created_at?: unknown;
}

/**
 * Map a notification to the route it should open when clicked.
 * Role-aware so the same bell works for students and facilitators.
 *
 * Notifications carry a `relatedId` that deep-links to the underlying
 * entity when a route supports it (e.g. opening a specific conversation).
 */
export function notificationRoute(
  role: Role | undefined,
  notification: UiNotification,
): string | null {
  const type = notification.type;
  const relatedId = notification.relatedId;
  const base = role === "facilitator" ? "/facilitator" : "/student";

  switch (type) {
    case "message":
      // Deep-link straight into the conversation thread.
      return relatedId
        ? `${base}/messages?conversation=${encodeURIComponent(relatedId)}`
        : `${base}/messages`;
    case "appointment":
    case "reschedule":
      return `${base}/appointments`;
    case "risk":
      return role === "facilitator" ? "/facilitator/risk-alerts" : `${base}/dashboard`;
    case "work_hours":
      return role === "facilitator" ? "/facilitator/work-hours" : `${base}/dashboard`;
    case "assessment":
    case "assignment":
    case "grade":
      return `${base}/assessments`;
    case "info":
    case "alert":
    default:
      return `${base}/dashboard`;
  }
}