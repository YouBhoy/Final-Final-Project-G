# DIAGNOSIS COMPLETE - Root Cause Identified

## The Bug

When a facilitator accepts an appointment, `ensureConversation()` is called to create a conversation. This function:

1. Opens a transaction
2. Reads the conversation document (line 218 in messaging.service.ts)
3. If it doesn't exist, creates it with both participants
4. If it exists, updates metadata fields

**The failing operation is the READ (BatchGetDocuments) inside the transaction.**

## Why the Read Fails

Looking at the conversation security rules (lines 184-199):

```go
allow read, update: if isActiveUser()
  && request.auth.uid in resource.data.participantIds  // ← THIS IS THE PROBLEM
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly([...]);
```

**Firestore evaluates read rules even for non-existent documents.** When the read rule accesses `resource.data.participantIds` on a document that doesn't exist:
- `resource.data` is `null` or undefined
- Accessing `.participantIds` on it throws a rules evaluation error
- The error manifests as "Missing or insufficient permissions"

Even if the document DOES exist but the reading user hasn't been added to `participantIds` yet, the read would fail.

## The Specific Sequence That Breaks

In `acceptAppointment()`:
1. Facilitator accepts appointment → appointment status changes to 'accepted'
2. `ensureConversation([facilitatorId, studentId])` is called
3. Inside a transaction, it tries to read conversation with ID: `{sorted facilitatorId + studentId}`
4. If this conversation was just created by the student (or doesn't exist), the read fails
5. The facilitator can't read a conversation they're not a participant in

## Working Theory Confirmed

The hypothesis about `request.resource.data` vs `resource.data` was partially correct, but the **actual bug is in the READ rule**, not the write rule. When reading a non-existent conversation:
- `resource.data` doesn't exist
- The rule tries to access `resource.data.participantIds`
- This causes a permission error

## Solution

The conversation rules need to handle three cases:
1. **Creating** a new conversation - user must be in `request.resource.data.participantIds`
2. **Reading** an existing conversation - user must be in `resource.data.participantIds`
3. **Updating** an existing conversation - user must be a participant AND only allowed fields change

The current rules conflate read and update into a single rule, which causes the create/read check to be overly restrictive.

## Recommended Fix

Split the rules to handle each operation type separately:

```go
match /conversations/{conversationId} {
  // Read: only participants can read
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

**This preserves the field-level restriction for updates while allowing reads to work on existing conversations and creates to work for new ones.**