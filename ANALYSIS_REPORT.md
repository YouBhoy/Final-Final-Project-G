# SPARTAN-G Mobile — Appointment Acceptance Bug Analysis Report

**Date:** 2026-07-13  
**Analyst:** Cline (AI Assistant)  
**Severity:** Critical (blocks core facilitator workflow)  
**Status:** Root cause identified, fix implemented, pending verification

---

## Executive Summary

Facilitators cannot accept appointment requests. When attempting to accept an appointment, the operation fails with:
```
FirebaseError: Missing or insufficient permissions.
[Firestore] BatchGetDocuments failed — permission-denied
```

This is a **general bug** affecting all facilitator accounts, confirmed with multiple test accounts.

---

## Technical Analysis

### Affected Component
- **Primary:** Firestore Security Rules (`spartan-g/firebase/firestore.rules`)
- **Secondary:** Messaging Service (`spartan-g/packages/shared-services/src/services/messaging.service.ts`)
- **Trigger:** Appointment Service (`spartan-g/packages/shared-services/src/services/appointment.service.ts`)

### Root Cause

Commit **5a5a456** (merged from main into app branch) modified the conversation security rules to add field-level restrictions for updates. This change inadvertently broke the ability to read conversations during appointment acceptance.

**Before commit 5a5a456:**
```go
match /conversations/{conversationId} {
  allow read, update: if isActiveUser()
    && request.auth.uid in resource.data.participantIds;
  // ... other rules
}
```

**After commit 5a5a456:**
```go
match /conversations/{conversationId} {
  allow read, update: if isActiveUser()
    && request.auth.uid in resource.data.participantIds
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'lastMessageAt', 'lastMessagePreview', 'lastMessageId',
      'lastMessageSenderId', 'lastMessageType', 'unreadCount', 'updatedAt'
    ]);
  // ... other rules
}
```

### Why This Breaks Appointment Acceptance

The `acceptAppointment()` flow calls `messagingService.ensureConversation()` to create a conversation between facilitator and student. This method:

1. Opens a Firestore transaction
2. Reads the conversation document (`transaction.get()` → `BatchGetDocuments` internally)
3. If the document doesn't exist, creates it with `transaction.set()`
4. If it exists, updates metadata fields

**The failure occurs during step 2** when reading a conversation that:
- Doesn't exist yet (new appointment), OR
- Was created by the student but facilitator hasn't been added yet

When Firestore evaluates the read rule on a non-existent document:
- `resource.data` is `null` or undefined
- Accessing `resource.data.participantIds` throws a rules evaluation error
- This manifests as "Missing or insufficient permissions"

### The Specific Failure Sequence

```
Facilitator clicks "Accept" on appointment request
    ↓
acceptAppointment() transaction commits (appointment status → 'accepted')
    ↓
ensureConversation([facilitatorId, studentId]) is called
    ↓
Transaction starts, attempts to read conversation document
    ↓
BatchGetDocuments request sent to Firestore
    ↓
Security rules evaluate: request.auth.uid in resource.data.participantIds
    ↓
ERROR: resource.data is undefined for non-existent document
    ↓
Permission denied → "BatchGetDocuments failed"
    ↓
Appointment acceptance fails with error message
```

---

## Evidence Collected

### Files Examined
1. `spartan-g/firebase/firestore.rules` — Security rules (lines 184-199)
2. `spartan-g/packages/shared-services/src/services/appointment.service.ts` — Appointment logic (lines 181-270)
3. `spartan-g/packages/shared-services/src/services/messaging.service.ts` — Messaging logic (lines 203-258)
4. `spartan-g/packages/shared-services/src/repositories/base.repository.ts` — Base repository pattern
5. Git history: commit 5a5a456 (main branch)

### Key Code Paths

**appointment.service.ts (line 240):**
```typescript
await messagingService.ensureConversation([facilitatorId, result], actorRole);
```

**messaging.service.ts (lines 217-229):**
```typescript
await runTransaction(db, async (transaction) => {
  const conversationDoc = await transaction.get(conversationRef);
  if (!conversationDoc.exists()) {
    transaction.set(conversationRef, {
      participantIds: normalizedParticipantIds,
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: '',
      unreadCount: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as ConversationDocument);
    return;
  }
  // ... update existing conversation
});
```

---

## Solution Implemented

### Fix Applied
Split the combined `read, update` rule into three separate, operation-specific rules:

```go
match /conversations/{conversationId} {
  // Read: only participants can read existing conversations
  allow read: if isActiveUser()
    && request.auth.uid in resource.data.participantIds;
  
  // Create: user must be one of the participants being added
  allow create: if isActiveUser()
    && request.auth.uid in request.resource.data.participantIds;
  
  // Update: user must be participant AND only metadata fields can change
  allow update: if isActiveUser()
    && request.auth.uid in resource.data.participantIds
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'lastMessageAt', 'lastMessagePreview', 'lastMessageId',
      'lastMessageSenderId', 'lastMessageType', 'unreadCount', 'updatedAt'
    ]);
  
  allow delete: if isSuperAdmin();
}
```

### Why This Fix Works

1. **Read rule no longer checks `request.resource.data`** — Removes the problematic dependency on request data for read operations
2. **Create rule uses `request.resource.data`** — Correctly validates that the Creating user is one of the participants being added
3. **Update rule keeps field restrictions** — Preserves the security improvement from commit 5a5a456 for update operations
4. **Each operation type has appropriate checks** — Read checks existing participants, create checks incoming participants, update checks both

---

## Testing & Verification

### Manual Testing Required
1. Log in as facilitator (Kurt Victorino or Jose Emmanuel Silva)
2. Navigate to appointment requests
3. Click "Accept" on a pending appointment
4. Verify appointment is accepted and conversation is created
5. Verify both parties can see the conversation

### Expected Behavior After Fix
- Facilitator clicks "Accept" → appointment status changes to 'accepted'
- Conversation is created automatically with both participants
- Student receives notification
- Both parties can view and message in the conversation

### Rollback Plan
If the fix causes issues, revert `spartan-g/firebase/firestore.rules` to the pre-5a5a456 state:
```go
match /conversations/{conversationId} {
  allow read, update: if isActiveUser()
    && request.auth.uid in resource.data.participantIds;
  allow create: if isActiveUser()
    && request.auth.uid in request.resource.data.participantIds;
  allow delete: if isSuperAdmin();
}
```
Note: This loses the field-level update restrictions but restores functionality.

---

## Impact Assessment

### What's Broken
- **Facilitator appointment acceptance** — completely non-functional
- **Conversation creation during acceptance** — blocked by security rules
- **Affects all users** — not account-specific

### What's Still Working
- Student appointment requests
- Facilitator dashboard (read-only)
- Other messaging features (existing conversations)
- Appointments display

### Risk Level
- **High** — blocks a core user workflow
- **Scope:** All facilitators across web and mobile platforms
- **Data loss:** None (appointments are not deleted, just cannot be accepted)

---

## Recommendations

### Immediate Actions
1. ✅ **Done:** Fix security rules in `firestore.rules`
2. **Pending:** Manual testing with facilitator accounts
3. **Pending:** Verify conversation creation works end-to-end

### Short-Term Improvements
1. Add integration tests for appointment acceptance flow
2. Add security rules unit tests (using Firebase Rules Unit Testing framework)
3. Add more granular error messages when appointments fail to accept
4. Add diagnostic logging in `ensureConversation()` to identify operation type (read vs. write) on failure

### Long-Term Improvements
1. Establish a security rules review process before merging from main to app
2. Create automated security rules validation in CI/CD pipeline
3. Document all Firestore security rule changes in commit messages
4. Consider splitting app branch security rules from main if they diverge frequently

---

## Related Issues & Known Limitations

### Known Lower-Priority Issues (Not Blocking)
1. Messaging shows "Unknown User" instead of participant names (cosmetic bug)
2. TypeScript warning in `packages/shared-services` (tsconfig.json issue)
3. Facilitator dashboard shows "Coming Soon" placeholder (matches web)

### Workflow Notes
- When merging main into app, watch for `packages/shared-services/src/config/env.ts` reappearing (causes import.meta parse errors)
- Firestore composite indexes may need manual creation in Firebase Console if query errors occur

---

## Appendix: Debugging Process

### Hypotheses Evaluated

1. **Hypothesis:** Conversation collection rule checks `request.auth.uid` in wrong field  
   **Status:** Partially correct — issue is in read rule, not create rule  
   **Evidence:** Diff of commit 5a5a456 shows field-level restriction added

2. **Hypothesis:** Failure occurs on write operation (conversation creation)  
   **Status:** Incorrect  
   **Evidence:** Error message shows "BatchGetDocuments" which is a read operation

3. **Hypothesis:** Failure occurs on read operation (conversation existence check)  
   **Status:** Confirmed  
   **Evidence:** BatchGetDocuments = read; occurs before any write; security rule accessing `resource.data` on non-existent doc

4. **Hypothesis:** Issue is specific to mobile app  
   **Status:** Incorrect  
   **Evidence:** Briefing notes confirm it's a general bug affecting web as well

---

## References

- **Firestore Security Rules:** https://firebase.google.com/docs/firestore/security/rules-conditions
- **Firestore Transactions:** https://firebase.google.com/docs/firestore/manage-data/transactions
- **Project Architecture:** See `spartan-g/ARCHITECTURE.md`
- **Git Commit:** 5a5a4566df85b93da8e3ae14d9bcb6530670281d

---

**Report Status:** Complete  
**Next Action:** Manual verification of fix with test facilitator accounts