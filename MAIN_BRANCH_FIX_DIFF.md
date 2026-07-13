# Main Branch Fix — Port ensureConversation() for Appointment Acceptance

## Current Buggy Code (main branch)

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Lines:** ~239-249

```typescript
await setDoc(
  doc(db, COLLECTIONS.CONVERSATIONS, [facilitatorId, result].sort().join('_')),
  {
    participantIds: [facilitatorId, result],
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  },
  { merge: true },
);
```

**Problem:** This raw `setDoc` is missing required fields (`lastMessageAt`, `lastMessagePreview`, `unreadCount`) that the security rules and messaging system expect. After commit 5a5a456, the updated Firestore rules enforce field-level restrictions that reject incomplete conversation documents.

---

## Proposed Fix

Replace the raw `setDoc` with `messagingService.ensureConversation()`, which properly initializes all required fields and handles both create and update scenarios.

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

---

## Why This Fix Works

The `ensureConversation()` method (already implemented in `messaging.service.ts` on the app branch):

1. Normalizes participant IDs
2. Computes a deterministic conversation ID (`sorted participants joined by _`)
3. Opens a transaction
4. If conversation doesn't exist: creates it with all required fields:
   - `participantIds`
   - `lastMessageAt` (serverTimestamp)
   - `lastMessagePreview` (empty string)
   - `unreadCount` (empty object)
   - `createdAt` (serverTimestamp)
   - `updatedAt` (serverTimestamp)
5. If conversation exists: updates missing metadata fields if needed
6. Returns the conversation ID

This matches the security rule expectations and is already proven to work on the app (mobile) branch.

---

## Additional Context

**File:** `packages/shared-services/src/services/appointment.service.ts`  
**Current imports on main branch (confirmed):**
- Line 14: `setDoc` is imported from `../firebase/firestore`
- Messaging service is NOT imported

**Required change to imports:**
The fix will require adding `messagingService` to the imports if not already present.