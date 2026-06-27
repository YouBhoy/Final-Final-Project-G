# Phase 7A — Appointment Scheduling Implementation Plan (Revised)

**Date:** 2025-06-27  
**Status:** Plan Ready (Audit previously completed)

---

## Executive Summary

The previous version of this plan has been revised to reflect the updated workflow. Messaging is now unlocked **exclusively through accepted appointments**, not through support requests. The appointment lifecycle has been expanded to support detailed counseling workflows with better status tracking.

**Phase 6A Impact:** The `facilitator-student-link.service.ts` `requestSupport()` method and accept/reject UI in messaging pages should be **deprecated** — they were built for the old support-request flow. The repository and type are still needed (auto-created by appointment acceptance).

---

## 1. Updated Appointment Lifecycle

```
        Student books appointment
                  │
                  ▼
         Status: 'requested'
                  │
                  ▼
        ┌─── Facilitator reviews ───┐
        │                           │
        ▼                           ▼
   Status: 'accepted'          Status: 'rejected'
        │
        ├── Auto-create facilitator_student_link (if missing)
        ├── Auto-create conversation (if missing)
        └── Messaging unlocked
        │
        ▼
   Status: 'no_show'  ← student didn't attend
        │
        ▼
   Status: 'completed' (with outcomeNotes)
        │
        └── Conversation preserved (history kept)
```

**Statuses:**
- `requested` — Student booked, awaiting facilitator response
- `accepted` — Facilitator confirmed, link+conversation auto-created
- `completed` — Appointment finished, outcome notes added
- `cancelled` — Cancelled by student (while `requested`) or facilitator (any time)
- `rejected` — Facilitator declined the request
- `no_show` — Student didn't attend

**Cancellation rules:**
- Students can only cancel when status is `requested`
- Facilitators can cancel any appointment (status moves to `cancelled`)
- If cancelled after `accepted`, conversation remains

---

## 2. Schema Changes

### Appointment Status (firestore-schemas.ts + firestore.types.ts)

**Before:**
```typescript
status: 'scheduled | completed | cancelled'
```

**After:**
```typescript
status: 'requested | accepted | completed | cancelled | rejected | no_show'
```

### New Appointment Fields

```typescript
appointments: {
  studentId: 'string',
  facilitatorId: 'string',
  scheduledAt: 'timestamp',
  durationMinutes: 'number',
  status: 'requested | accepted | completed | cancelled | rejected | no_show',
  notes: 'string?',                    // facilitator notes (shared with student)
  facilitatorNotes: 'string?',         // facilitator private notes (not student-visible)
  outcomeNotes: 'string?',             // outcome after completion
  notifyBeforeMinutes: 'number',
  createdAt: 'timestamp',
  updatedAt: 'timestamp',
}
```

**⚠️ Permission:** `facilitatorNotes` and `outcomeNotes` must be **student-read-restricted** in Firestore rules. Students can see `notes` but NOT `facilitatorNotes` or `outcomeNotes`.

---

## 3. Phase 6A Impact Assessment

### What Needs to Change in Phase 6A

| File | Status | Action |
|------|--------|--------|
| `facilitator-student-link.service.ts` | ⚠️ Deprecate `requestSupport()` | Keep the file, but `requestSupport()` is no longer called from UI. The `acceptRequest()` / `rejectRequest()` inside is used by appointment service internally. |
| `StudentMessagesPage.tsx` | ⚠️ Needs update | Remove "pending request count" display — no more support requests |
| `FacilitatorMessagesPage.tsx` | ⚠️ Needs update | Remove accept/reject support request cards — facilitators handle requests from Appointments page |
| `facilitator-student-link.repository.ts` | ✅ Keep | Still used (auto-created by appointment acceptance) |
| `facilitator-student-link.service.ts` — `getConversationId()` | ✅ Keep | Used to look up conversation for existing links |
| `facilitator-student-link.service.ts` — `getAcceptedLinks()` | ✅ Keep | Used to show which students have active links |

**After Phase 7A, the messaging flow will be:**
1. Student books appointment → status `requested`
2. Facilitator accepts → status `accepted`
3. `appointment.service.ts` calls `facilitatorStudentLinkService.acceptRequest()` internally
4. `appointment.service.ts` calls `messagingService.createConversation()` internally
5. Messaging appears in the student's and facilitator's conversation lists

---

## 4. Service Changes

### appointment.service.ts (Extended)

| Method | Purpose | Permission |
|--------|---------|------------|
| `getAppointments(facilitatorId, role)` | Facilitator sees all their appointments | MANAGE_APPOINTMENTS |
| `getStudentAppointments(studentId, role)` | Student sees their appointment history | BOOK_APPOINTMENTS (new) |
| `getUpcoming(facilitatorId, role)` | Upcoming scheduled appointments | MANAGE_APPOINTMENTS |
| `requestAppointment(payload, role)` | Student creates appointment (status: requested) | BOOK_APPOINTMENTS |
| `acceptAppointment(id, facilitatorId, role)` | Facilitator accepts → auto-create link+conversation | MANAGE_APPOINTMENTS |
| `rejectAppointment(id, facilitatorId, role)` | Facilitator rejects | MANAGE_APPOINTMENTS |
| `completeAppointment(id, outcomeNotes, role)` | Mark as completed | MANAGE_APPOINTMENTS |
| `cancelAppointment(id, role, userId)` | Cancel (student or facilitator) | BOOK_APPOINTMENTS or MANAGE_APPOINTMENTS |
| `markNoShow(id, role)` | Mark as no-show | MANAGE_APPOINTMENTS |
| `getAvailableSlots(facilitatorId, date, role)` | Generate available time slots | BOOK_APPOINTMENTS |
| `isSlotAvailable(facilitatorId, date, duration, role)` | Check if a specific slot is free | BOOK_APPOINTMENTS |

### New Permission: BOOK_APPOINTMENTS

Add to `permissions.ts`:
```typescript
BOOK_APPOINTMENTS: 'book_appointments',
```

Assign to:
- `ROLES.STUDENT`: `PERMISSIONS.BOOK_APPOINTMENTS`
- `ROLES.FACILITATOR`: `PERMISSIONS.MANAGE_APPOINTMENTS`
- `ROLES.SUPER_ADMIN`: `PERMISSIONS.MANAGE_APPOINTMENTS`

---

## 5. Firestore Rule Changes

### Appointments Collection

```javascript
match /appointments/{appointmentId} {
  // Read: owner (student or facilitator) or admin
  allow read: if isFacilitatorOrAdmin()
    || (isStudent() && resource.data.studentId == request.auth.uid);

  // Create: students can book, facilitators/admins can create
  allow create: if isStudent()
    && request.resource.data.studentId == request.auth.uid
    && request.resource.data.status == 'requested'
    || isFacilitatorOrAdmin();

  // Update: complex rules based on role and status
  allow update: if isFacilitatorOrAdmin()
    || (isStudent()
      && resource.data.studentId == request.auth.uid
      && resource.data.status == 'requested'
      // Students can only change status to 'cancelled' or update nothing
      && (request.resource.data.status == 'cancelled'
        || !request.resource.data.diff(resource.data).affectedKeys().hasAny(['status']))
      // Students cannot edit facilitatorNotes or outcomeNotes
      && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['facilitatorNotes', 'outcomeNotes'])
    );
  allow delete: if isSuperAdmin();
}
```

**⚠️ Critical:** `facilitatorNotes` and `outcomeNotes` are excluded from student updates.

---

## 6. Index Changes

Add to `firestore.indexes.json`:

```json
{
  "collectionGroup": "appointments",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "studentId", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "scheduledAt", "order": "DESCENDING" }
  ]
}
```

---

## 7. Updated UI Plan

### New Components

| Component | Purpose | Role |
|-----------|---------|------|
| `FacilitatorList.tsx` | Browse facilitators (name, bio, availability status) | Student |
| `FacilitatorProfileCard.tsx` | Show facilitator details + work hours | Student |
| `ScheduleCalendar.tsx` | Simple month-view calendar for date selection | Student |
| `TimeSlotPicker.tsx` | Grid of available time slots based on work hours | Student |
| `AppointmentCard.tsx` | Single appointment display with action buttons | Both |
| `AppointmentStatusBadge.tsx` | Color-coded status badge | Both |
| `AppointmentList.tsx` | Scrollable list of appointments with filters | Both |

### New Pages

| Page | Purpose | Role |
|------|---------|------|
| `StudentFindFacilitatorPage.tsx` | Browse facilitators, view profiles | Student |
| `StudentBookAppointmentPage.tsx` | Select date, time slot, confirm booking | Student |
| `StudentAppointmentsPage.tsx` | View appointment history, cancel pending | Student |
| `FacilitatorAppointmentsPage.tsx` | View requests, manage queue | Facilitator |
| `FacilitatorWorkHoursPage.tsx` | Manage weekly availability | Facilitator |

### Routes to Update

**Student Portal:**
- `/student/facilitators` — Browse facilitators (NEW route + nav item)
- `/student/facilitator/:facilitatorId` — View profile + book (NEW)
- `/student/appointments` — View history (replace placeholder)

**Facilitator Portal:**
- `/facilitator/appointments` — Manage requests (replace placeholder)
- `/facilitator/work-hours` — Manage schedule (NEW route + nav item)

### Navigation Items

**Student (`navConfigs.ts`):**
- "Find Facilitator" with search icon — NEW
- "Appointments" already exists (replace placeholder)
- "Messages" already exists (Phase 6A)

**Facilitator (`navConfigs.ts`):**
- "Appointments" already exists (replace placeholder)
- "Work Hours" — NEW
- "Messages" already exists (Phase 6A)

---

## 8. Updated Implementation Order

```
Phase 1: Backend Changes (extend existing)
  ├─ 1.1 Update appointment status enum: 'requested | accepted | completed | cancelled | rejected | no_show'
  ├─ 1.2 Add facilitatorNotes + outcomeNotes to appointment schema/type
  ├─ 1.3 Add BOOK_APPOINTMENTS permission to permissions.ts
  ├─ 1.4 Extend appointment.service.ts with full lifecycle (request, accept, reject, complete, cancel, noShow, getAvailableSlots, isSlotAvailable, getStudentAppointments)
  ├─ 1.5 Integrate link+conversation auto-creation in acceptAppointment()
  ├─ 1.6 Update Firestore rules (student booking, facilitatorNotes restriction)
  └─ 1.7 Add student appointment index

Phase 2: Update Phase 6A Messaging UI
  ├─ 2.1 Remove support request UI from StudentMessagesPage
  ├─ 2.2 Remove accept/reject cards from FacilitatorMessagesPage
  └─ 2.3 Clean up imports and state

Phase 3: Work Hours UI (Facilitator)
  ├─ 3.1 Create FacilitatorWorkHoursPage
  └─ 3.2 Add route and navigation

Phase 4: Appointment Management UI (Facilitator)
  ├─ 4.1 Create AppointmentCard, AppointmentStatusBadge, AppointmentList components
  ├─ 4.2 Create FacilitatorAppointmentsPage (view requests, accept/reject, complete, cancel, mark no-show)
  └─ 4.3 Replace placeholder route

Phase 5: Appointment Booking UI (Student)
  ├─ 5.1 Create FacilitatorList component (browse facilitators)
  ├─ 5.2 Create FacilitatorProfileCard component (view profile + work hours)
  ├─ 5.3 Create ScheduleCalendar and TimeSlotPicker components
  ├─ 5.4 Create StudentFindFacilitatorPage
  ├─ 5.5 Create StudentBookAppointmentPage
  ├─ 5.6 Create StudentAppointmentsPage (history + cancel)
  └─ 5.7 Add routes and navigation items

Phase 6: Integration Testing
  ├─ 6.1 Test: Book → accept → auto-link → message
  ├─ 6.2 Test: Student cancel (pending), facilitator cancel (accepted)
  ├─ 6.3 Test: Reject, no-show, complete flows
  ├─ 6.4 Test: Work hours management
  ├─ 6.5 Test: facilitatorNotes/outcomeNotes isolation
  └─ 6.6 Typecheck and verify
```

---

## 9. Services to Reuse (No Duplication)

| Service | How Used |
|---------|----------|
| `appointment.service.ts` | Extended, not replaced |
| `work-hours.service.ts` | Reused as-is |
| `facilitator-student-link.service.ts` | Called internally by appointment service (`acceptRequest()` pattern) |
| `messaging.service.ts` | Called internally by appointment service (`createConversation()`) |
| `user.service.ts` | Reused as-is for facilitator profiles |

## 10. Repositories to Reuse (No Duplication)

| Repository | How Used |
|------------|----------|
| `appointment.repository` | Extended with no new methods (existing `getByStudent` is sufficient) |
| `work-hours.repository` | Reused as-is |
| `facilitator-student-link.repository` | Reused as-is |
| `conversation.repository` | Reused as-is |
| `message.repository` | Reused as-is |

---

## 11. Summary

| Component | Current | Target |
|-----------|---------|--------|
| Appointment Status Enum | `scheduled \| completed \| cancelled` | `requested \| accepted \| completed \| cancelled \| rejected \| no_show` |
| Appointment Fields | No facilitator/outcome notes | `notes?`, `facilitatorNotes?`, `outcomeNotes?` |
| Permissions | `MANAGE_APPOINTMENTS` only | + `BOOK_APPOINTMENTS` for students |
| Messaging Unlock | Support request (old) | Appointment accepted (new) |
| Rules | Blocks student booking | Allows student booking + note isolation |
| Indexes | Missing student index | Added |
| UI (Student) | Placeholder | Browse, book, history, cancel |
| UI (Facilitator) | Placeholder | Requests, manage, complete, work hours |
| **Total Files** | **11 new + 10 modified** | **~1,500 LOC** |

No duplicate services or repositories. Everything extends existing infrastructure.