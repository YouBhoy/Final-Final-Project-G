/**
 * Week-scoping helpers for Work Hours.
 *
 * Work hours are set per week: a schedule belongs to the Monday–Sunday week
 * identified by its `weekStartDate`. Only the current week's schedules are
 * active; old and future weeks are not bookable.
 */

/** Return the Monday (00:00:00 local time) of the week that contains `date`. */
export function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay(); // 0 = Sunday
  const daysSinceMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + daysSinceMonday);
  return start;
}

/** Return the Sunday (23:59:59 local time) of the week that contains `date`. */
export function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** True when `a` and `b` fall inside the same Monday–Sunday week. */
export function isSameWeek(a: Date, b: Date): boolean {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

/** Compact week key used in per-week document IDs, e.g. "20260907". */
export function weekKey(date: Date): string {
  const start = startOfWeek(date);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const d = String(start.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Human-readable label for the week containing `date`, e.g. "Week of Sep 7 – 13, 2026".
 * The end date omits the month when it's the same as the start's month.
 */
export function formatWeekRange(date: Date): string {
  const start = startOfWeek(date);
  const end = endOfWeek(date);
  const fmtMonthDay = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const startLabel = fmtMonthDay(start);
  const endLabel =
    start.getMonth() === end.getMonth()
      ? String(end.getDate())
      : fmtMonthDay(end);
  return `Week of ${startLabel} – ${endLabel}, ${start.getFullYear()}`;
}