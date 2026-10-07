/**
 * Student booking window: today through this week's Saturday, in Asia/Manila.
 *
 * SOURCE OF TRUTH for the rule. The web booking UI imports this file, and
 * firebase/functions/src/bookingWindow.ts is a byte-for-byte copy (functions
 * cannot import outside their own src). A test fails if the two ever differ.
 *
 * Pure arithmetic, no Intl or Date-local APIs: Asia/Manila is a fixed UTC+8
 * zone with no daylight saving, so every machine computes the same boundary.
 */

export const BOOKING_TIMEZONE = 'Asia/Manila';
export const BOOKING_WINDOW_MESSAGE = 'Booking is only available for the current week.';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MANILA_OFFSET_MS = 8 * HOUR_MS;

export interface BookingWindow {
  /** Start of today in Asia/Manila (inclusive), as UTC milliseconds. */
  startMs: number;
  /** Start of next Sunday in Asia/Manila (exclusive), as UTC milliseconds. */
  endMs: number;
  /** 'YYYY-MM-DD' for today (Manila). */
  startDateKey: string;
  /** 'YYYY-MM-DD' for this week's Saturday (Manila). */
  endDateKey: string;
  /** Every bookable calendar day, today through Saturday, as 'YYYY-MM-DD'. */
  dateKeys: string[];
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Shift an instant so its UTC fields read as Asia/Manila wall-clock fields. */
const toManilaFields = (ms: number) => new Date(ms + MANILA_OFFSET_MS);

/** 'YYYY-MM-DD' of the Asia/Manila calendar day containing this instant. */
export function manilaDateKey(ms: number): string {
  const d = toManilaFields(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Minutes since midnight (Asia/Manila) of this instant. */
export function manilaMinutesOfDay(ms: number): number {
  const d = toManilaFields(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** The instant for a Manila wall-clock time on a 'YYYY-MM-DD' day. */
export function manilaDateTimeToMs(dateKey: string, hour: number, minute: number): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day, hour, minute) - MANILA_OFFSET_MS;
}

/** Today (Manila) through this week's Saturday; weeks run Sunday to Saturday. */
export function getBookingWindow(nowMs: number): BookingWindow {
  const manilaNow = toManilaFields(nowMs);
  const dayOfWeek = manilaNow.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const startMs = Date.UTC(manilaNow.getUTCFullYear(), manilaNow.getUTCMonth(), manilaNow.getUTCDate()) - MANILA_OFFSET_MS;
  const daysLeft = 6 - dayOfWeek; // days after today until Saturday
  const endMs = startMs + (daysLeft + 1) * DAY_MS;
  const dateKeys: string[] = [];
  for (let i = 0; i <= daysLeft; i += 1) dateKeys.push(manilaDateKey(startMs + i * DAY_MS));
  return { startMs, endMs, startDateKey: dateKeys[0], endDateKey: dateKeys[dateKeys.length - 1], dateKeys };
}

/** Whether an appointment start time falls inside today..Saturday (Manila). */
export function isWithinBookingWindow(scheduledAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(scheduledAtMs)) return false;
  const { startMs, endMs } = getBookingWindow(nowMs);
  return scheduledAtMs >= startMs && scheduledAtMs < endMs;
}
