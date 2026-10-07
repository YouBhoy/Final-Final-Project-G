import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOOKING_TIMEZONE,
  getBookingWindow,
  isWithinBookingWindow,
  manilaDateKey,
  manilaDateTimeToMs,
  manilaMinutesOfDay,
} from '../lib/bookingWindow.js';

// Manila wall clock -> instant (UTC+8, no daylight saving).
const manila = (y, m, d, h = 0, min = 0, s = 0, ms = 0) => Date.UTC(y, m - 1, d, h - 8, min, s, ms);

test('the functions copy of the helper is identical to the shared-types source', () => {
  const shared = readFileSync(new URL('../../../packages/shared-types/src/utils/booking-window.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const copy = readFileSync(new URL('../src/bookingWindow.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(copy, shared, 'update both files together');
  assert.equal(BOOKING_TIMEZONE, 'Asia/Manila');
});

test('midweek: the window runs from today (Manila midnight) to Saturday', () => {
  const w = getBookingWindow(manila(2030, 1, 2, 10)); // Wednesday
  assert.deepEqual(w.dateKeys, ['2030-01-02', '2030-01-03', '2030-01-04', '2030-01-05']);
  assert.equal(w.startDateKey, '2030-01-02');
  assert.equal(w.endDateKey, '2030-01-05');
  assert.equal(w.startMs, manila(2030, 1, 2));
  assert.equal(w.endMs, manila(2030, 1, 6));
});

test('Sunday gives the full Sunday..Saturday week; Saturday gives only today', () => {
  assert.equal(getBookingWindow(manila(2030, 1, 6, 8)).dateKeys.length, 7);
  assert.deepEqual(getBookingWindow(manila(2030, 1, 5, 8)).dateKeys, ['2030-01-05']);
});

test('a week that spans two months lists both months\' days', () => {
  const w = getBookingWindow(manila(2030, 4, 30, 9)); // Tuesday 30 April 2030
  assert.deepEqual(w.dateKeys, ['2030-04-30', '2030-05-01', '2030-05-02', '2030-05-03', '2030-05-04']);
});

test('inside and outside the window', () => {
  const now = manila(2030, 1, 2, 10);
  assert.equal(isWithinBookingWindow(now, now), true, 'today');
  assert.equal(isWithinBookingWindow(manila(2030, 1, 5, 23, 59, 59, 999), now), true, 'last millisecond of Saturday');
  assert.equal(isWithinBookingWindow(manila(2030, 1, 6, 0, 0, 0, 0), now), false, 'Sunday 00:00 of next week');
  assert.equal(isWithinBookingWindow(manila(2030, 1, 9, 9), now), false, 'next Wednesday');
  assert.equal(isWithinBookingWindow(manila(2030, 2, 1, 9), now), false, 'next month');
  assert.equal(isWithinBookingWindow(manila(2030, 1, 1, 23, 59, 59, 999), now), false, 'yesterday, last millisecond');
  assert.equal(isWithinBookingWindow(manila(2030, 1, 2, 0, 0, 0, 0), now), true, 'start of today');
  assert.equal(isWithinBookingWindow(Number.NaN, now), false);
});

test('the boundary is Manila midnight, not UTC midnight', () => {
  const lastSaturdayMs = manila(2030, 1, 5, 23, 59, 59, 999); // 15:59:59.999Z on Saturday
  assert.equal(new Date(lastSaturdayMs).toISOString(), '2030-01-05T15:59:59.999Z');
  assert.equal(getBookingWindow(lastSaturdayMs).dateKeys.length, 1, 'still Saturday in Manila');
  const sunday = lastSaturdayMs + 1; // 16:00:00.000Z = Sunday 00:00 Manila
  assert.equal(manilaDateKey(sunday), '2030-01-06');
  assert.equal(getBookingWindow(sunday).dateKeys.length, 7, 'a new week has started');
  assert.equal(isWithinBookingWindow(manila(2030, 1, 5, 20), sunday), false, 'last Saturday evening is now the past week');
});

test('Manila time helpers round-trip', () => {
  const ms = manilaDateTimeToMs('2030-01-04', 9, 30);
  assert.equal(manilaDateKey(ms), '2030-01-04');
  assert.equal(manilaMinutesOfDay(ms), 9 * 60 + 30);
  assert.equal(new Date(ms).toISOString(), '2030-01-04T01:30:00.000Z');
});
