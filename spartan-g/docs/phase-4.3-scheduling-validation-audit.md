# Phase 4.3 Scheduling Validation Audit

**Date:** July 9, 2026  
**Status:** Audit Complete — No Code Changes  
**Purpose:** Comprehensive audit of appointment scheduling system before implementation

---

## Executive Summary

The appointment scheduling system is the central workflow for facilitator-student relationships, messaging, and risk follow-up. This audit identifies **3 Critical**, **5 High**, and **2 Low** severity issues that need resolution before building the Student Timeline and analytics features.

**Key Findings:**
- Double booking is possible due to missing atomic slot reservation
- Non-atomic operations in `acceptAppointment()` can leave system in inconsistent state
- All appointment statuses block availability (should only be `requested` and `accepted`)
- No duplicate request prevention
- No conversation reuse on rebooking

---

## 1. Double-Booking Protection

### Issue: Race Condition in Slot Booking

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Lines:** 46-65

**Current Implementation:**
```typescript
async requestAppointment(payload: RequestAppointmentPayload, actorRole: Role) {
  // No availability check before creating appointment
  const id = `${payload.facilitatorId}_${payload.studentId}_${Date.now()}`;
  await appointmentRepository.create(id, data);
  return id;
}
```

**Problem:**
- `requestAppointment()` creates an appointment without checking if the slot is available
- Two students can book the same time slot within milliseconds
- No Firestore transaction wraps the availability check + create

**Severity:** 🔴 **Critical**

**Recommended Fix:**
- Add atomic check in `requestAppointment()` that queries existing appointments for the same time
- Use Firestore transaction or batched write
- Check for overlap: `newStart < existingEnd && newEnd > existingStart`

---

## 2. Available Slot Generation

### Issue: All Appointment Statuses Block Availability

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Lines:** 262-272, 290-294

**Current Implementation:**
```typescript
const existingAppointments = await appointmentRepository.getAll([
  { fieldPath: 'facilitatorId', op: '==', value: facilitatorId } as any,
  { fieldPath: 'scheduledAt', op: '>=', value: startOfDay } as any,
  { fieldPath: 'scheduledAt', op: '<=', value: endOfDay } as any,
]);

const isBooked = existingAppointments.some((apt) => {
  return slotStart < aptEnd && slotEnd > aptStart;
});
```

**Problem:**
- `getAvailableSlots()` fetches ALL appointments regardless of status
- `cancelled`, `rejected`, and `no_show` appointments still block availability
- Overlap detection logic IS correct (line 293)
- But the status filter is missing

**Correct Logic:**
```
if appointment overlaps slot
AND appointment.status IN ["requested", "accepted"]
then slot unavailable
```

**Severity:** 🔴 **Critical**

**Recommended Fix:**
- Add status filter: `where('status', 'in', ['requested', 'accepted'])`

---

## 3. Transaction Boundaries

### Issue: Non-Atomic Operations in `acceptAppointment()`

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Lines:** 67-133

**Current Implementation:**
```typescript
async acceptAppointment(appointmentId: string, facilitatorId: string, actorRole: Role) {
  // 1. Update appointment status
  await appointmentRepository.update(appointmentId, { status: 'accepted' });
  
  // 2. Create facilitator_student_link
  await facilitatorStudentLinkRepository.create(linkId, {...});
  
  // 3. Create conversation
  await messagingService.createConversation([...]);
  
  // 4. Update slot
  await appointmentSlotRepository.update(matchingSlot.id, {...});
}
```

**Problem:**
- Four separate write operations
- If any step fails, system is left in inconsistent state
- Example failure scenarios:
  - Appointment accepted but no conversation created
  - Link created but appointment update fails
  - Slot updated but link creation fails

**Severity:** 🔴 **Critical**

**Recommended Fix:**
- Use Firestore batched write or transaction
- All operations should succeed or fail together

---

## 4. Prevent Duplicate Active Appointment Requests

### Issue: Student Can Create Multiple Active Appointments

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Lines:** 46-65

**Current Implementation:**
- No check for existing `requested` or `accepted` appointments for same student/facilitator/time

**Problem:**
- Student can book same slot multiple times
- Creates multiple active appointments
- Completed, cancelled, rejected, and no-show appointments should not block a new request

**Severity:** 🟠 **High**

**Recommended Fix:**
- In `requestAppointment()`, check for existing `requested` or `accepted` appointments
- Query: `where('studentId', '==', studentId) && where('facilitatorId', '==', facilitatorId) && where('status', 'in', ['requested', 'accepted'])`

---

## 5. Reuse Existing Facilitator-Student Conversations

### Issue: Multiple Conversations for Same Pair

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Lines:** 67-133

**Current Implementation:**
- `acceptAppointment()` always creates a new conversation
- No check for existing conversation between facilitator-student pair

**Problem:**
- If a student books multiple appointments with the same facilitator
- Each acceptance creates a new conversation
- Should reuse existing conversation

**Architecture:**
- There should be exactly one long-lived conversation per facilitator-student relationship
- Messaging persists across multiple appointments

**Severity:** 🟠 **High**

**Recommended Fix:**
- Check for existing conversation before creating
- Use `messagingService.getConversationId()` or query conversations

---

## 6. Facilitator Cancellation

### Issue: Cannot Cancel Accepted Appointments

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Lines:** 199-227

**Current Implementation:**
- `cancelAppointment()` only allows cancellation of `requested` appointments
- Facilitators cannot cancel `accepted` appointments

**Problem:**
- Facilitators may need to cancel for legitimate reasons
- Current lifecycle missing this transition

**Severity:** 🟠 **High**

**Recommended Fix:**
- Allow facilitators to cancel `accepted` appointments
- Add `cancelled` transition from `accepted`

---

## 7. Slot Restoration on Cancellation

### Issue: Slot Status Not Restored

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Lines:** 199-227

**Current Implementation:**
- `cancelAppointment()` only updates the appointment status
- No code to update the corresponding `appointment_slot` back to `available`

**User Feedback:**
- Slot restoration should be conditional on whether the appointment originated from an `appointment_slot`
- If appointments are generated directly from work hours, no slot document exists
- Only restore if `appointment.slotId` or matching slot exists

**Severity:** 🟠 **High**

**Recommended Fix:**
- In `cancelAppointment()`, check if appointment has an associated slot
- If slot exists, set status to `available` and clear `appointmentId`

---

## 8. Time Validation

### Issue: No Past Booking Prevention

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Lines:** 46-65

**Current Implementation:**
- No validation that `scheduledAt` is in the future
- No validation that `scheduledAt` is within work hours

**Problem:**
- Students can book appointments in the past
- Students can book outside work hours

**Severity:** 🟠 **High**

**Recommended Fix:**
- Add validation: `if (payload.scheduledAt < new Date()) throw new Error('Cannot book in the past')`
- Validate against work hours before allowing booking

---

## Summary Table

| # | Issue | Severity | File | Lines |
|---|-------|----------|------|-------|
| 1 | Double booking race condition | Critical | appointment.service.ts | 46-65 |
| 2 | All statuses block availability | Critical | appointment.service.ts | 262-294 |
| 3 | Non-atomic operations in acceptAppointment() | Critical | appointment.service.ts | 67-133 |
| 4 | Duplicate appointment requests | High | appointment.service.ts | 46-65 |
| 5 | Duplicate conversation creation | High | appointment.service.ts | 67-133 |
| 6 | Facilitators cannot cancel accepted | High | appointment.service.ts | 199-227 |
| 7 | Slot status not restored on cancellation | High | appointment.service.ts | 199-227 |
| 8 | No past booking prevention | High | appointment.service.ts | 46-65 |

---

## Recommended Implementation Order

### Phase 4.3.1 — Data Integrity (Critical)

| Order | Fix | Effort |
|-------|-----|--------|
| 1 | Add status filter to `getAvailableSlots()` query | 15 min |
| 2 | Transactional `requestAppointment()` with availability check | 30 min |
| 3 | Transactional `acceptAppointment()` with batched writes | 20 min |

### Phase 4.3.2 — Appointment Lifecycle (High)

| Order | Fix | Effort |
|-------|-----|--------|
| 4 | Prevent duplicate appointment requests | 15 min |
| 5 | Reuse existing conversation in `acceptAppointment()` | 10 min |
| 6 | Add slot restoration on cancellation (conditional) | 20 min |
| 7 | Add past booking validation | 10 min |
| 8 | Allow facilitators to cancel accepted appointments | 15 min |

**Total Estimated Effort:** ~2 hours

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/shared-services/src/services/appointment.service.ts` | All critical and high fixes |
| `packages/shared-services/src/services/messaging.service.ts` | Add conversation lookup method |

> **Note:** No speculative indexes added. Firestore will prompt for required indexes during testing.