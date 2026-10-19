import type { UtcDay } from './types';

const DAY_MS = 86_400_000;

/** Reject normalized impossible dates (for example February 30). */
export function parseUtcDay(value: unknown): UtcDay {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError('Expected a UTC calendar date in YYYY-MM-DD form');
  }
  const instant = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) {
    throw new RangeError('Invalid UTC calendar date');
  }
  return value as UtcDay;
}

/** The caller supplies the clock; no client clock or implicit Date.now is consulted. */
export function utcDayFromDate(instant: Date): UtcDay {
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Invalid reward instant');
  return parseUtcDay(instant.toISOString().split('T')[0]);
}

export function isPreviousUtcDay(previous: UtcDay, current: UtcDay): boolean {
  return Date.parse(`${parseUtcDay(current)}T00:00:00.000Z`)
    - Date.parse(`${parseUtcDay(previous)}T00:00:00.000Z`) === DAY_MS;
}
