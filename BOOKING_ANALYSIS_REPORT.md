# SPARTAN-G Mobile — Appointment Booking Date/Time Bug Analysis Report

**Date:** 2026-07-13  
**Analyst:** Cline (AI Assistant)  
**Severity:** Medium (blocks student appointment booking)  
**Status:** Root cause analyzed, fix pending confirmation

---

## Executive Summary

Students attempting to book appointments receive an erroneous error: `Cannot book appointments in the past`, even when selecting a future date and time.

This is a **general bug** in the mobile booking flow, not account-specific.

---

## Technical Analysis

### Affected Component
- **Primary:** `spartan-g/apps/mobile/src/screens/student/BookAppointmentScreen.tsx` (lines 85-113)
- **Secondary:** `spartan-g/packages/shared-services/src/services/appointment.service.ts` (lines 95-97)

### Root Cause

The `handleBook` function constructs a `Date` object from the selected date and time, then passes it to `appointmentService.requestAppointment()`, which validates:

```typescript
if (payload.scheduledAt < new Date()) {
  throw new Error('Cannot book appointments in the past');
}
```

**Key findings:**

1. **No timezone/UTC mismatch bug exists** in the epoch-ms comparison. Both `scheduledAt` and `new Date()` are Date objects in the same JavaScript runtime context, so the comparison is correct at the epoch level.

2. **No off-by-one errors** in date construction. `new Date(currentYear, currentMonth, day)` correctly uses zero-based month indexing that matches the native Date constructor.

3. **The actual bug:** The calendar UI blocks past **dates** visually (lines 180-186), but it does **NOT** block past **times** within the current day. If a user selects today's date and chooses a time that has already passed in local time, the validation correctly (but unexpectedly to the user) rejects it.

**Screenshot evidence:**
- Screenshot timestamp: 11:04 local time
- If user selected 09:00 on the same day → `scheduledAt` = 09:00, `new Date()` = 11:04
- Result: `scheduledAt < new Date()` → `true` → error thrown

---

## Code Analysis

### Date Construction Flow

```typescript
// 1. selectedDate is created as local-time midnight
setSelectedDate(new Date(currentYear, currentMonth, day));  // line 82

// 2. In handleBook, a clone is made
const scheduledAt = new Date(selectedDate);  // line 91

// 3. Time is set on the clone
scheduledAt.setHours(hours, minutes, 0, 0);  // line 92

// 4. Validation compares against current moment
if (payload.scheduledAt < new Date()) {  // appointment.service.ts:95
  throw new Error('Cannot book appointments in the past');
}
```

### Why This Looks Like a Timezone Bug (but isn't)

The `new Date(year, month, day)` constructor interprets arguments in **local time**. After `setHours()`, the Date object still represents local time. The epoch-ms comparison in `requestAppointment()` is timezone-agnostic because both Dates are evaluated in the same runtime.

**However**, if the user's device timezone is ahead of UTC (e.g., UTC+8 Philippines), the displayed local time and the UTC instant have an offset. While the comparison itself is correct, the **user's perception of "future" may differ** if they are thinking in UTC rather than local time, or if the calendar display does not clearly indicate today's date/time constraints.

---

## UI/UX Gap

The calendar component (lines 136-203) disables past dates:

```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);
const isPast = date < today;
// ...
disabled={isPast}
```

But the time picker (lines 220-239) allows any time string, including times that have already passed today. Selecting 09:00 when it's now 11:04 is allowed by the UI but rejected by the validation.

---

## Hypothesis Evaluation

| Hypothesis | Status | Evidence |
|------------|--------|----------|
| Timezone mismatch between client and server | **Rejected** | Both `scheduledAt` and `new Date()` are in the same JavaScript process; epoch-ms comparison is correct |
| Off-by-one in month/day construction | **Rejected** | `getMonth()` is zero-based; `Date` constructor expects zero-based month |
| Past times within current day not blocked by UI | **Confirmed** | Calendar blocks past dates but not past times; user can select 09:00 when it's already 11:04 |
| Device clock skew | **Unlikely** | Would require significant clock drift to cause this consistently |
| Timezone display confusion | **Possible contributing factor** | User may not realize the selected time is in the past relative to their current local time |

---

## Evidence Gathered

### Files Examined
1. `spartan-g/apps/mobile/src/screens/student/BookAppointmentScreen.tsx`
2. `spartan-g/packages/shared-services/src/services/appointment.service.ts`
3. Screenshot showing error at 11:04 local time

### Relevant Code Sections
- **Lines 80-83** (`handleDateSelect`): Creates local-time Date for selected day
- **Lines 85-92** (`handleBook`): Combines date and time into `scheduledAt`
- **Lines 136-138**: Calendar "today" is computed as local midnight
- **Lines 180-186**: Calendar disables past dates only
- **Lines 220-234**: Time picker allows any time string without validation against current time

---

## Recommended Fix

### Option A: Add "past time" guard in UI (Recommended)

Disable times that are in the past when the selected date is today:

```typescript
// In the time picker rendering logic
const now = new Date();
const isToday = selectedDate.toDateString() === now.toDateString();
const [selectedHours, selectedMinutes] = selectedTime.split(':').map(Number);
const selectedTotalMinutes = selectedHours * 60 + selectedMinutes;
const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();
const isPastTime = isToday && selectedTotalMinutes <= currentTotalMinutes;
```

Then use `isPastTime` to disable the "Request Appointment" button or show a warning.

### Option B: Normalize to UTC explicitly

If the issue is actually timezone-related (needs instrumentation to confirm), construct the Date using UTC:

```typescript
const scheduledAt = new Date(
  Date.UTC(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
    hours,
    minutes,
    0
  )
);
```

**Pros:** Removes any timezone ambiguity.  
**Cons:** May affect other parts of the system that expect local time; requires broader testing.

### Option C: Adjust validation to be timezone-aware

Change the validation in `appointmentService.requestAppointment()` to compare only the date portion if the intent is to allow any time on future dates:

```typescript
const now = new Date();
const scheduledDateOnly = new Date(payload.scheduledAt.getFullYear(), payload.scheduledAt.getMonth(), payload.scheduledAt.getDate());
const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
if (scheduledDateOnly < todayOnly) {
  throw new Error('Cannot book appointments in the past');
}
```

**Note:** This would allow booking for today even if the time has already passed, which may not be desired.

---

## Instrumentation to Confirm

Before applying any fix, add temporary logging to `handleBook` to capture the actual values being compared:

```typescript
const scheduledAt = new Date(selectedDate);
scheduledAt.setHours(hours, minutes, 0, 0);
console.log('[Book] selectedDate=', selectedDate.toString(), 
  'scheduledAt=', scheduledAt.toString(), 
  'scheduledAtISO=', scheduledAt.toISOString(), 
  'nowISO=', new Date().toISOString(), 
  'nowEpoch=', Date.now(), 
  'scheduledEpoch=', scheduledAt.getTime());
```

Expected patterns:
- If `scheduledAt.toISOString()` is **before** `new Date().toISOString()` → timezone issue or genuinely past time
- If the selected time is visually in the future but ISO shows it's in the past → timezone offset issue
- If both ISO strings show the selected time is genuinely in the past → UI simply needs better time blocking

---

## Impact Assessment

### What's Broken
- **Student appointment booking** — fails when selecting a time that is in the past relative to current clock time, even if the calendar date is in the future
- **Affects all students** — not account-specific

### What's Still Working
- Facilitator appointment acceptance (pending verification of security rules fix)
- Other appointment operations (viewing, cancelling)

### Risk Level
- **Medium** — blocks a core user workflow but has a clear workaround (select a later time or tomorrow's date)
- **Scope:** All students using the mobile booking flow

---

## Recommendations

### Immediate Actions
1. **Add instrumentation** as shown above to confirm exact timezone/clock behavior
2. **Based on logs**, apply one of the three fix options outlined above
3. **Test** with multiple timezone settings if possible

### Short-Term Improvements
1. Add unit tests for date/time construction edge cases
2. Add integration tests for booking flow with mocked times
3. Display remaining available hours in the time picker to guide user selection
4. Show a warning if selected time is within the next N minutes

### Long-Term Improvements
1. Consider using a universal "day starts at" reference for all date comparisons in both web and mobile
2. Establish timezone handling conventions across the codebase
3. Add E2E tests for booking flow on devices with different timezone settings

---

## References

- **Related Files:** `BookAppointmentScreen.tsx`, `appointment.service.ts`
- **Previous Fix:** Security rules fix for facilitator appointment acceptance (commit 5a5a456 analysis)
- **Firestore Timestamps:** https://firebase.google.com/docs/firestore/manage-data/timestamps

---

**Report Status:** Analysis complete; awaiting instrumentation confirmation and fix selection