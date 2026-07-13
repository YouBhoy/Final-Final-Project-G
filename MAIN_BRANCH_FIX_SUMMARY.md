# Main Branch Fix Summary

## Problem Confirmed
The main (web) branch has the same bug that was fixed on the app (mobile) branch:
- `acceptAppointment()` in main uses a raw `setDoc()` call to create conversations
- This raw call only provides `participantIds`, `updatedAt`, and `createdAt`
- It's missing required fields: `lastMessageAt`, `lastMessagePreview`, `unreadCount`
- After commit 5a5a456, security rules enforce field-level restrictions that reject incomplete documents
- Result: facilitators cannot accept appointments on web

## The Fix

**File:** `packages/shared-services/src/services/appointment.service.ts`

**Change:** Replace the raw `setDoc` call with `messagingService.ensureConversation()`

```diff
------- SEARCH
      await setDoc(
        doc(db, COLLECTIONS.CONVERSATIONS, [facilitatorId, result].sort().join('_')),
        {
          participantIds: [facilitatorId, result],
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
=======
      await messagingService.ensureConversation([facilitatorId, result], actorRole);
+++++++ REPLACE
```

## Why This Works
- `ensureConversation()` is already implemented in `messaging.service.ts`
- It properly initializes all required conversation fields
- It handles both create and update scenarios
- It's already proven to work on the app (mobile) branch
- The import `messagingService` already exists on line 26

## Stuck Appointment Recovery

Once the fix is applied, reset the stuck appointment with:

```bash
firebase firestore:get appointments --where status==accepted
```

Then reset it:
```bash
firebase firestore:set appointments/<APPOINTMENT_ID> --data "{\"status\":\"requested\"}"
```

Replace `<APPOINTMENT_ID>` with the actual ID from the first command.

## Status
Awaiting user confirmation to apply the fix.