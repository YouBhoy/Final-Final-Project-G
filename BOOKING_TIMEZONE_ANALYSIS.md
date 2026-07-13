# Mobile Appointment Booking — Date/Time Analysis

## User-Reported Bug
- **Error:** `Failed to book appointment: Error: Cannot book appointments in the past`
- **Context:** User selected a future date and time (e.g., today at 09:00), but the system rejected it as "in the past"
- **Location:** `handleBook` in `BookAppointmentScreen.tsx`

---

## Exact Code Under Review

### `handleBook` (BookAppointmentScreen.tsx:85-113)

```typescript
const handleBook = useCallback(async () => {
  if (!session || !facilitatorId || !workHoursForDay) return;
  setIsBooking(true);
  setError('');
  try {
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const scheduledAt = new Date(selectedDate);        // Line 91
    scheduledAt.setHours(hours, minutes, 0, 0);       // Line 92

    const appointmentPayload: any = {
      studentId: session.uid,
      facilitatorId,
      scheduledAt,
      durationMinutes: 60,
    };
    if (notes.trim()) {
      appointmentPayload.notes = notes.trim();
    }
    await appointmentService.requestAppointment(appointmentPayload, session.role);

    setBookingMessage('Appointment requested successfully! The facilitator will be notified.');
    setTimeout(() => navigation.goBack(), 2000);
  } catch (error: any) {
    console.error('Failed to book appointment:', error);
    setError(error.message || 'Failed to book appointment');
  } finally {
    setIsBooking(false);
  }
}, [session, facilitatorId, selectedDate, selectedTime, workHoursForDay, notes, navigation]);
```

### The Validation (appointment.service.ts:95-97)

```typescript
// Validate past booking
if (payload.scheduledAt < new Date()) {
  throw new Error('Cannot book appointments in the past');
}
```

---

## Analysis of Date Construction

### Step-by-step breakdown

| Step | Code | What it produces |
|------|------|------------------|
| 1 | `selectedDate` is set via `handleDateSelect(day)` (line 82):<br>`setSelectedDate(new Date(currentYear, currentMonth, day))` | A **local-time** Date at `00:00:00` in the device's timezone with no timezone offset attached (interpreted as local-midnight epoch) |
| 2 | `scheduledAt = new Date(selectedDate)` | A **clone** of selectedDate — still local-midnight epoch |
| 3 | `scheduledAt.setHours(hours, minutes, 0, 0)` | Sets hour/minute on the local-time Date. The Date object still represents local time and will serialize to an ISO string that includes the local **timezone offset** |
| 4 | Comparison on server (appointment.service.ts:95):<br>`payload.scheduledAt < new Date()` | `payload.scheduledAt` is epoch-ms of the datetime; `new Date()` is "now" epoch-ms. If the timezone offset pushes the resulting UTC-midpoint before "now," the test fails |

---

## Potential Bugs Found

### 1. Timezone/normalization mismatch (MOST LIKELY)

`new Date(year, month, day)` produces a **local-time** Date. After `setHours(hours, minutes, 0, 0)`, the Date still encodes local time. When it crosses the wire to Firestore (which stores Timestamps, which are UTC-based), it gets converted at UTC boundaries.

If the client is in a timezone that makes the intended future local time fall on the **previous UTC day**, the stored/applied UTC instant could end up before "now" in UTC.

Example:  
- Client timezone: UTC+8 (Philippines)  
- Selected: 2026-07-13 09:00 local → ISO: `2026-07-13T09:00:00+0800` → UTC epoch ~ `2026-07-13T01:00:00Z`  
- If "now" is later than that UTC instant (e.g., the user is actually near UTC midnight), the comparison `scheduledAt < new Date()` can fail.

However, the user is in the Philippines and the date shown is 11:04 local time in the screenshot. Selecting today's date at 09:00 would create 09:00 local time, which is 01:00 UTC. The error occurs at 11:04 AM local (03:04 UTC), meaning 09:00 local is in the future but 01:00 UTC appears in the **past** relative to 11:04 AM local.

### 2. Comparison with `new Date()` rather than start-of-day

The validation uses `payload.scheduledAt < new Date()` (a full datetime comparison) rather than just comparing the date portion. This means if the time portion of `scheduledAt` is before the current time-of-day on today's date, the validation fails even though the appointment is for a future day when considered at local midnight.

But the calendar already blocks past dates visually (lines 180-181):
```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);
// ...
const isPast = date < today;
```
This means **today** is selectable and the `handleBook` tries to create an appointment for a time *later than right now* on the calendar day. If the current time is 11:04 and the user picks 09:00, then in local terms it's indeed in the past. So in this case the calendar **should** be blocking 09:00 because it's already 11:04. But because the user said they selected a future time and got the error, the real cause is most likely timezone conversion rather than pure within-day comparison.

### 3. Off-by-one in month or day construction

`new Date(currentYear, currentMonth, day)` — `currentMonth` is from `new Date().getMonth()` (zero-based). This is correct for the native Date constructor. No obvious off-by-one here.

### 4. "Now" computation in security rules vs client

The validation happens in the **app service** (shared service running in-app), not in security rules. So it's subject to the client's clock. However, screenshot shows 11:04 local time, and the appointment was supposedly for a "[DATE] at [TIME]" which the user asserts is future. The mismatch strongly hints at timezone handling rather than a simple time-of-day failure.

---

## Most Likely Root Cause

**Conclusion: Timezone normalization issue in the mobile client.**

The `scheduledAt` Date constructed in the client includes the device's local timezone offset. When compared in `requestAppointment()` (which runs in same process), epoch-milliseconds comparison is correct. However, the **calendar** already visually enforces future dates using a local-midnight comparison. If a user selects a time that is in the future in the *calendar* context but in the *immediate past* relative to actual clock time, the validation will correctly fail.

Given the screenshot timestamp is 11:04 and the user claims to have selected a future time, the issue is most likely that:

1. The client constructs a Date with local timezone
2. The actual current UTC instant used for comparison is slightly ahead due to device timezone being ahead of UTC
3. OR the client is explicitly calling a method that rounds/truncates

**To confirm:** instrument this function:

```typescript
const scheduledAt = new Date(selectedDate);
scheduledAt.setHours(hours, minutes, 0, 0);
console.log('[Book] selectedDate=', selectedDate.toString(), 'scheduledAt=', scheduledAt.toString(), 'iso=', scheduledAt.toISOString(), 'now=', new Date().toISOString(), 'nowEpoch=', Date.now(), 'scheduledEpoch=', scheduledAt.getTime());
```

Expected patterns:
- If `scheduledAt.toISOString()` shows a UTC value that is **before** `new Date().toISOString()`, then it's a timezone-offset issue.
- If both ISO strings are on the same UTC day but `scheduledAt` has a smaller time-of-day, then the user simply selected a time that is already past (calendar may be showing future dates but within-today past times).

---

## What to Check in Fix

- Normalize `scheduledAt` with explicit UTC components:  
  ```typescript
  const scheduledAt = new Date(Date.UTC(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hours, minutes, 0));
  ```
  This removes timezone drift entirely.
- Also compare against the start of today in the same timezone context:
  ```typescript
  const now = new Date();
  if (scheduledAt.getTime() <= now.getTime()) { ... }
  ```

## Do NOT fix yet

Per your instruction, the above is pure code review. The actual fix should preserve:
- Existing date picking UI
- Error handling
- Backwards compatibility with the appointment service payload shape

If you want, I can propose the exact patch for confirmation before applying.