/**
 * Shared date/time formatting utilities for the mobile app.
 * All time displays use 12-hour format (AM/PM) for user-friendliness.
 */

/**
 * Convert a Firestore Timestamp, Date, or string to a 12-hour time string.
 * Example: "9:00 AM", "10:30 PM"
 */
export function formatTimeOnly(timestamp: any): string {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Convert a Firestore Timestamp, Date, or string to a full date + 12-hour time string.
 * Example: "Jul 20, 2026, 9:00 AM"
 */
export function formatDateTime(timestamp: any): string {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Convert 24-hour "HH:MM" strings (from WorkHoursScheduleDocument) to 12-hour format.
 * Example: "09:00" + "17:00" → "9:00 AM - 5:00 PM"
 */
export function formatWorkHours(startTime: string, endTime: string): string {
  const format = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };
  return `${format(startTime)} - ${format(endTime)}`;
}