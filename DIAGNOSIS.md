# Appointment Acceptance Permission Denied - Root Cause Analysis

## Summary
The facilitator cannot accept appointments because `ensureConversation()` fails inside the appointment acceptance transaction. The failure is a **Firestore security rules mismatch** introduced in commit 5a5a456.

## Evidence Gathered

### 1. Current Conversation Rules (firestore.rules lines 184-199)
```go
match /conversations/{conversationId} {
  allow read, update: if isActiveUser()
    && request.auth.uid in resource.data.participantIds
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'lastMessageAt',
      'lastMessagePreview',
      'lastMessageId',
      'lastMessageSenderId',
      'lastMessageType',
      'unreadCount',
      'updatedAt',
    ]);
  allow create: if isActiveUser()
    && request.auth.uid in request.resource.data.participantIds;
  allow delete: if isSuperAdmin();
}
```

### 2. The Bug
**Commit 5a5a456** modified the conversation update rule to restrict which fields can be modified:

```diff
-        && request.auth.uid in resource.data.participantIds;
+        && request.auth.uid in resource.data.participantIds
+        && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
+          'lastMessageAt',
+          'lastMessagePreview',
+          'lastMessageId',
+          'lastMessageSenderId',
+          'lastMessageType',
+          'unreadCount',
+          'updatedAt',
+        ]);
```

### 3. Why This Breaks `ensureConversation()`

The `ensureConversation()` method (messaging.service.ts lines 203-258) tries to **CREATE** a conversation using `transaction.set()`. The logic:

1. Reads the conversation with `transaction.get(conversationRef)` (line 218)
2. If it doesn't exist, creates it with `transaction.set()` (line 221)
3. If it exists, updates it with "lastMessageAt" and "unreadCount" (line 253)

### 4. The Failure Point

When `setDoc()` is called on an **existing** document, Firestore treats it as an UPDATE operation (not a CREATE), even though the initial intention was "ensure it exists." This triggers the `allow update` rule instead of `allow create`.

However, even if it were a pure CREATE, the `ensureConversation` method always starts with a `transaction.get()` inside a transaction. For **new conversations**, this read might cause issues with the rule evaluation.

### 5. Root Cause
The update rule is **too restrictive** - it blocks updates to fields like:
- `participantIds` 
- `createdAt`
- `updatedAt` (but wait, this is allowed)

Most critically, it blocks `participantIds`, but `ensureConversation`'s write path (when document exists) doesn't actually update `participantIds`, so that's not the immediate problem.

**The real issue is likely this sequence:**
1. `transaction.get()` in line 218 of messaging.service.ts tries to read the conversation (BatchGetDocuments internally)
2. This read probably triggers permission checks
3. The participant ID check on `resource.data` works for existing conversations
4. But for existing conversations that need minor updates, the `affectedKeys().hasOnly([...])` restriction might be rejecting the update if ANY field outside that list is being touched

### 6. Confirmed Flow in acceptAppointment (appointment.service.ts)
```typescript
async acceptAppointment(appointmentId: string, facilitatorId: string, actorRole: Role) {
  // Lines 189-254: Transaction that accepts the appointment
  // Line 240: Calls ensureConversation AFTER the transaction commits
  await messagingService.ensureConversation([facilitatorId, result], actorRole);
}
```

## Recommendation

The security rule for conversations needs to be fixed to:
1. Allow the create operation to work (already partially there)
2. Allow updates that only modify the "lastMessage" metadata fields
3. Consider that `setDoc` on existing docs = update, so the update rule must be permissive enough

### Proposed Fix
The update rule should check:
- User is a participant (currently works)
- Only allowed fields are being modified (currently broken for new conversations or metadata-only updates)

**However:** Before making changes, we need to verify:
1. Is the failure on the **read** (transaction.get inside ensureConversation)?
2. Or on the **write** (transaction.set when conversation exists)?

The console error shows "BatchGetDocuments failed" which is a **read operation**. This suggests the error happens during the read-check in `ensureConversation()`, not during the create itself.

### Alternative Hypothesis: Missing Read Permission for Pending Conversation
When `ensureConversation` tries to read a conversation that doesn't exist yet, the read check might fail if:
- The conversation doesn't exist → read rules still apply
- The conversation rules for read require `request.auth.uid in resource.data.participantIds`
- But `resource.data` is undefined for non-existent docs

This could be the actual bug! The read rule access `resource.data.participantIds` without guarding for document existence.

## Immediate Next Steps (without modifying rules yet)

1. Add detailed logging in `ensureConversation()` to identify exactly which operation fails
2. Check Firestore logs to see if the failing operation is the read or the write
3. Confirm the exact line in the security rule evaluation that fails

## Questions to Answer Before Fixing Rules
1. Is the failing operation a READ or a WRITE?
2. Does it fail on the initial existence check or on the create operation?
3. Can we adjust `ensureConversation` to not use transactions, or to handle permissions differently?