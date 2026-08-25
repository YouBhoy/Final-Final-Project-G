# Mobile-Web Integration Audit: Branch Comparison Report

**Date:** 2026-07-12  
**Auditor:** Automated codebase analysis  
**Branches Compared:** `main` (current web) vs `origin/app` (existing mobile)  
**Scope:** Messaging architecture, shared services, authentication, Firebase usage, state management

---

## 1. Executive Summary

### 1.1 Key Finding

**The shared-services layer is already identical between branches.** The `messaging.service.ts`, repositories, types, and Firebase layer have NOT diverged. This is excellent news — it means the architectural foundation for a unified backend already exists.

### 1.2 What's Different

| Category | Status |
|----------|--------|
| Shared services (`packages/shared-services/`) | ✅ **Identical** |
| Shared types (`packages/shared-types/`) | ✅ **Identical** |
| Firebase config & rules | ✅ **Identical** |
| Messaging service layer | ✅ **Identical** |
| Messaging repositories | ✅ **Identical** |
| Web messaging UI | ✅ Exists on both branches |
| Mobile messaging UI | ❌ **Does NOT exist on app branch** |
| Push notification adapters | ✅ **App branch has both** (expo + web) |
| Authentication | ⚠️ Minor differences |
| State management | ⚠️ Different patterns |

### 1.3 Readiness Score: 7/10

The backend is ready. The mobile app is missing messaging screens entirely.

---

## 2. Architecture Comparison

### 2.1 High-Level Structure

```
main branch:
spartan-g/
├── apps/web/          ← React web app (full messaging UI)
├── apps/mobile/       ← Placeholder directory
├── packages/
│   ├── shared-types/  ← Types, constants, RBAC
│   └── shared-services/ ← Firebase, repositories, services, store
└── firebase/          ← Rules, indexes

app branch:
spartan-g/
├── apps/web/          ← React web app (full messaging UI)
├── apps/mobile/       ← Expo mobile app (NO messaging screens)
│   ├── src/screens/   ← Auth, assessment, appointment screens
│   ├── src/adapters/  ← expo-messaging.adapter.ts
│   └── src/navigation/← React Navigation
├── packages/
│   ├── shared-types/  ← IDENTICAL to main
│   └── shared-services/ ← IDENTICAL to main
└── firebase/          ← IDENTICAL to main
```

### 2.2 Key Difference: Adapter Pattern

The `app` branch introduces a **messaging adapter pattern** that does not exist on `main`:

| File | Branch | Purpose |
|------|--------|---------|
| `packages/shared-services/src/firebase/messaging-adapter.ts` | **Both** | Abstract interface for push notifications |
| `apps/mobile/src/adapters/expo-messaging.adapter.ts` | **app only** | Expo Notifications → FCM implementation |
| `apps/web/src/adapters/web-messaging.adapter.ts` | **app only** | Firebase Web Messaging implementation |

**Impact:** The adapter pattern is the correct architecture. The `main` branch has the interface but no implementations. The `app` branch has both implementations. When merging, keep the `app` branch's adapter implementations.

### 2.3 What's Missing on the App Branch

The mobile app on the `app` branch has **NO messaging screens**:

| Feature | Web (main) | Mobile (app) |
|---------|-----------|---------------|
| Conversation list | ✅ `ConversationList.tsx` | ❌ Missing |
| Message thread | ✅ `MessageThread.tsx` | ❌ Missing |
| Message input | ✅ `MessageInput.tsx` | ❌ Missing |
| Message bubbles | ✅ `MessageBubble.tsx` | ❌ Missing |
| Conversation item | ✅ `ConversationItem.tsx` | ❌ Missing |
| Student messages page | ✅ `StudentMessagesPage.tsx` | ❌ Missing |
| Facilitator messages page | ✅ `FacilitatorMessagesPage.tsx` | ❌ Missing |

---

## 3. Messaging Comparison

### 3.1 Shared Messaging Service

**Verdict: IDENTICAL on both branches.**

```typescript
// Both branches have EXACTLY the same:
// packages/shared-services/src/services/messaging.service.ts

class MessagingService {
  async getConversations(userId, actorRole)     // ✅ Same
  async getMessages(conversationId, actorRole)   // ✅ Same
  async sendMessage(conversationId, senderId, body, actorRole, attachmentUrl?) // ✅ Same
  async createConversation(participantIds, actorRole) // ✅ Same
  subscribeToMessages(conversationId, actorRole, callback) // ✅ Same
}
```

### 3.2 Messaging Repositories

**Verdict: IDENTICAL on both branches.**

```typescript
// conversation.repository.ts — Same
class ConversationRepository extends BaseRepository<ConversationDocument> {
  async getByParticipant(userId)  // where('participantIds', 'array-contains', userId)
}

// message.repository.ts — Same
class MessageRepository extends BaseRepository<MessageDocument> {
  async getByConversation(conversationId)  // where('conversationId', '==', conversationId)
}
```

### 3.3 Firestore Collections

**Verdict: IDENTICAL on both branches.**

| Collection | Schema | Both Branches? |
|-----------|--------|----------------|
| `conversations` | `{ participantIds, lastMessageAt, lastMessagePreview, createdAt, updatedAt }` | ✅ Yes |
| `messages` | `{ conversationId, senderId, body, attachmentUrl?, isRead, createdAt, updatedAt }` | ✅ Yes |
| `device_tokens` | `{ uid, token, platform, deploymentTarget, createdAt, updatedAt }` | ✅ Yes |

### 3.4 Conversation IDs

**Verdict: IDENTICAL on both branches.**

```typescript
// Both branches use:
const convId = [facilitatorId, studentId].sort().join('_');
// e.g., "facilitator123_student456"
```

### 3.5 Message IDs

**Verdict: IDENTICAL on both branches.**

```typescript
// Both branches use (the same problematic pattern):
const messageId = `${conversationId}_${Date.now()}`;
```

### 3.6 Realtime Subscriptions

**Verdict: IDENTICAL on both branches.**

Both use Firestore `onSnapshot` via `BaseRepository.subscribeQuery()`. No WebSockets.

### 3.7 Messaging Adapter Pattern

**Verdict: App branch has implementations, main branch does not.**

The `messaging-adapter.ts` interface exists on both branches, but only the `app` branch has concrete implementations:

```typescript
// Both branches have the interface:
export interface MessagingAdapter {
  registerForPushNotifications(deploymentTarget): Promise<PushRegistrationResult | null>;
  onMessageReceived?(callback): () => void;
}

// Only app branch has implementations:
// apps/mobile/src/adapters/expo-messaging.adapter.ts  ← Uses expo-notifications
// apps/web/src/adapters/web-messaging.adapter.ts      ← Uses firebase/messaging
```

---

## 4. Authentication Comparison

### 4.1 Firebase Auth

**Verdict: IDENTICAL approach, different file locations.**

| Aspect | main branch | app branch |
|--------|-------------|------------|
| Auth provider | Firebase Auth Email/Password | Firebase Auth Email/Password |
| User document | `users/{uid}` | `users/{uid}` |
| Session management | `onAuthStateChanged` | `onAuthStateChanged` |
| Web auth hook | `apps/web/src/hooks/useAuth.tsx` | Same file |
| Mobile auth hook | N/A | `apps/mobile/src/hooks/useAuth.ts` |

### 4.2 Auth Service

**Verdict: IDENTICAL on both branches.**

```typescript
// packages/shared-services/src/services/auth.service.ts — Same on both
// Uses getFirebaseAuth() from shared Firebase layer
// Platform-aware via Platform parameter
```

### 4.3 Auth Store (Zustand)

**Verdict: IDENTICAL on both branches.**

```typescript
// packages/shared-services/src/store/auth.store.ts — Same on both
// Uses Zustand for auth state management
```

### 4.4 Web-Specific Auth Duplication

**Verdict: Same issue exists on both branches.**

Both branches have the duplicate `apps/web/src/lib/auth.ts` that duplicates `authService` from shared-services. This is a pre-existing issue, not a divergence.

---

## 5. Firebase Comparison

### 5.1 Firestore Access

**Verdict: IDENTICAL on both branches.**

```typescript
// packages/shared-services/src/firebase/firestore.ts — Same
// Same exports: getFirestoreDb, collection, doc, setDoc, etc.
```

### 5.2 Firebase App Initialization

**Verdict: IDENTICAL on both branches.**

```typescript
// packages/shared-services/src/firebase/app.ts — Same
// Uses env.ts for config, supports both EXPO_PUBLIC_* and VITE_*
```

### 5.3 Security Rules

**Verdict: IDENTICAL on both branches.**

```javascript
// firebase/firestore.rules — Same
// Same rules for conversations, messages, users, etc.
```

### 5.4 Firestore Indexes

**Verdict: IDENTICAL on both branches.**

```json
// firebase/firestore.indexes.json — Same
// Same composite indexes
```

### 5.5 Cloud Functions

**Verdict: Neither branch has Cloud Functions.**

No `firebase/functions/` directory exists on either branch. Push notifications are not implemented on either branch.

### 5.6 FCM (Firebase Cloud Messaging)

**Verdict: App branch has adapter, main branch does not.**

The `app` branch has:
- `expo-messaging.adapter.ts` — registers for push via Expo Notifications
- `web-messaging.adapter.ts` — registers for push via Firebase Web Messaging

Neither branch actually **sends** push notifications (no Cloud Function trigger).

### 5.7 Offline Persistence

**Verdict: Neither branch enables it.**

Both branches lack `enableMultiTabIndexedDbPersistence()` or similar.

---

## 6. Shared Code Opportunities

### 6.1 Already Shared (No Work Needed)

| Component | Location | Status |
|-----------|----------|--------|
| All types | `packages/shared-types/src/` | ✅ Already shared |
| All constants | `packages/shared-types/src/constants/` | ✅ Already shared |
| RBAC/permissions | `packages/shared-types/src/rbac/` | ✅ Already shared |
| Utility functions | `packages/shared-types/src/utils/` | ✅ Already shared |
| Firebase init | `packages/shared-services/src/firebase/` | ✅ Already shared |
| All repositories | `packages/shared-services/src/repositories/` | ✅ Already shared |
| All services | `packages/shared-services/src/services/` | ✅ Already shared |
| Zustand stores | `packages/shared-services/src/store/` | ✅ Already shared |
| Environment config | `packages/shared-services/src/config/` | ✅ Already shared |
| Messaging adapter interface | `packages/shared-services/src/firebase/messaging-adapter.ts` | ✅ Already shared |

### 6.2 Should Be Shared (Currently Duplicated)

| Component | main branch | app branch | Recommendation |
|-----------|-------------|------------|----------------|
| Auth web lib | `apps/web/src/lib/auth.ts` | Same file | Deprecate both, use `authService` from shared-services |
| Auth web hook | `apps/web/src/hooks/useAuth.tsx` | Same file | Keep web-specific (uses React Context) |
| Auth mobile hook | N/A | `apps/mobile/src/hooks/useAuth.ts` | Keep mobile-specific (uses Zustand directly) |

### 6.3 Platform-Specific (Should NOT Be Shared)

| Component | Reason |
|-----------|--------|
| Web messaging UI (`apps/web/src/components/messaging/`) | React + Tailwind — incompatible with React Native |
| Mobile messaging UI (not yet built) | Would use React Native primitives |
| Web navigation (`apps/web/src/navigation/`) | React Router — incompatible with React Navigation |
| Mobile navigation (`apps/mobile/src/navigation/`) | React Navigation — incompatible with React Router |
| Web auth hook (`apps/web/src/hooks/useAuth.tsx`) | Uses React Context |
| Mobile auth hook (`apps/mobile/src/hooks/useAuth.ts`) | Uses Zustand directly |
| Push notification adapters | Platform-specific (expo-notifications vs firebase/messaging) |

---

## 7. Code Duplication

### 7.1 Duplicate Code Found

| # | Duplicate | Branches | Severity | Recommendation |
|---|-----------|----------|----------|----------------|
| D1 | `apps/web/src/lib/auth.ts` duplicates `authService` | Both | MEDIUM | Deprecate and use shared-services auth |
| D2 | Web Firebase init (`apps/web/src/firebase/firebase.ts`) duplicates `shared-services/src/firebase/app.ts` | Both | LOW | Web could use shared-services directly |
| D3 | Conversation creation in `appointment.service.ts` duplicates `messaging.service.ts` | Both | HIGH | Centralize (same issue on both branches) |

### 7.2 Code Unique to Each Branch

| # | Code | Branch | Should It Exist? |
|---|------|--------|-----------------|
| U1 | `apps/mobile/src/adapters/expo-messaging.adapter.ts` | app | ✅ Yes — platform-specific |
| U2 | `apps/web/src/adapters/web-messaging.adapter.ts` | app | ✅ Yes — platform-specific |
| U3 | Mobile auth hook | app | ✅ Yes — platform-specific |
| U4 | Mobile navigation | app | ✅ Yes — platform-specific |
| U5 | Mobile screens (assessment, appointment, etc.) | app | ✅ Yes — platform-specific |
| U6 | Web messaging UI components | Both | ✅ Yes — platform-specific |

---

## 8. Risks

### 8.1 Risk Matrix

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | **Shared services diverge in the future** | HIGH | MEDIUM | Enforce that all business logic changes go into shared-services first, then consumed by both apps |
| R2 | **Mobile messaging screens built with different patterns** | MEDIUM | HIGH | Define shared component patterns before building mobile messaging |
| R3 | **Push notification logic duplicated** | MEDIUM | MEDIUM | Use Cloud Functions for server-side notification dispatch |
| R4 | **Auth state management diverges** | MEDIUM | LOW | Both branches already use the same Zustand auth store |
| R5 | **Firestore schema changes break one client** | HIGH | LOW | Schema changes must be backward-compatible; both clients read/write same collections |
| R6 | **Mobile app falls behind on shared service updates** | MEDIUM | HIGH | CI pipeline should test both apps against shared-services |

### 8.2 Blockers

| # | Blocker | Description | Impact |
|---|---------|-------------|--------|
| B1 | **No mobile messaging screens** | The app branch has zero messaging UI | Mobile users cannot send or read messages |
| B2 | **No push notification delivery** | Neither branch has Cloud Functions to send FCM | Mobile users get no notifications when app is closed |
| B3 | **No offline support** | Neither branch enables Firestore offline persistence | Mobile users lose messages on connectivity loss |

---

## 9. Recommended Architecture

### 9.1 Target Architecture

```
                    ┌─────────────────────────────┐
                    │     Firebase Backend         │
                    │  Auth | Firestore | Storage  │
                    │  Cloud Functions (FCM)       │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │   packages/shared-services/  │
                    │   packages/shared-types/     │
                    └──────────┬──────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Web Client    │  │  Mobile Client  │  │ Desktop (future)│
│   apps/web/     │  │  apps/mobile/   │  │                 │
│                 │  │                 │  │                 │
│ React + Tailwind│  │ React Native    │  │ Electron/Tauri  │
│ React Router    │  │ React Navigation│  │                 │
│ Web messaging UI│  │ Mobile msg UI   │  │ Desktop msg UI  │
│ Web push adapter│  │ Expo push adap. │  │ Desktop adapter │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 9.2 Data Flow

```
ALL CLIENTS use the same:

messagingService.sendMessage()  →  Firestore write
messagingService.subscribeToMessages()  →  Firestore onSnapshot
messagingService.getConversations()  →  Firestore query
conversationRepository  →  Firestore CRUD
messageRepository  →  Firestore CRUD

CLOUD FUNCTION (server-side, not client):
onMessageCreate  →  Look up device tokens  →  Send FCM push
```

### 9.3 Principle: Client-Agnostic Backend

```
                ┌──────────────────────────────┐
                │   Shared Business Logic       │
                │   (NO platform-specific code) │
                │                              │
                │  messaging.service.ts         │
                │  conversation.repository.ts   │
                │  message.repository.ts        │
                │  auth.service.ts              │
                │  ...                          │
                └──────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    Web UI Layer     Mobile UI Layer   Desktop UI Layer
    (React)          (React Native)    (Electron/Tauri)
    
    Each UI layer:
    - Imports from shared-services
    - Has its own components
    - Has its own navigation
    - Has its own platform adapters
    - Has ZERO business logic
```

---

## 10. Step-by-Step Migration Plan

### 10.1 Phase 1: Align Branches (Critical)

**Goal:** Ensure both branches have identical shared-services before any divergence.

| Step | Action | Effort | Risk |
|------|--------|--------|------|
| 1.1 | Verify `packages/shared-services/` is identical on both branches | 1 hour | Low |
| 1.2 | Verify `packages/shared-types/` is identical on both branches | 1 hour | Low |
| 1.3 | Verify `firebase/` (rules + indexes) is identical on both branches | 1 hour | Low |
| 1.4 | Merge any differences found (unlikely based on audit) | 2 hours | Low |

**Result:** Both branches share identical backend code.

### 10.2 Phase 2: Merge Adapter Pattern (Important)

**Goal:** Bring the messaging adapter implementations from `app` branch into `main`.

| Step | Action | Effort | Risk |
|------|--------|--------|------|
| 2.1 | Copy `apps/mobile/src/adapters/expo-messaging.adapter.ts` to `main` | 1 hour | Low |
| 2.2 | Copy `apps/web/src/adapters/web-messaging.adapter.ts` to `main` | 1 hour | Low |
| 2.3 | Ensure both adapters are registered via `setMessagingAdapter()` at app startup | 2 hours | Low |

**Result:** Both branches have push notification registration capability.

### 10.3 Phase 3: Build Mobile Messaging Screens (Critical)

**Goal:** Create mobile messaging UI that uses the same shared-services as web.

| Step | Action | Effort | Risk |
|------|--------|--------|------|
| 3.1 | Create `apps/mobile/src/screens/messaging/ConversationListScreen.tsx` | 8-16 hours | Medium |
| 3.2 | Create `apps/mobile/src/screens/messaging/MessageThreadScreen.tsx` | 8-16 hours | Medium |
| 3.3 | Create mobile messaging components (MessageBubble, MessageInput, etc.) | 8-16 hours | Medium |
| 3.4 | Add messaging routes to StudentNavigator and FacilitatorNavigator | 2-4 hours | Low |
| 3.5 | Add messaging nav items to mobile navigation config | 1 hour | Low |

**Result:** Mobile users can send and receive messages using the same backend as web.

### 10.4 Phase 4: Add Cloud Functions for Push (Important)

**Goal:** Server-side push notification delivery that works for all clients.

| Step | Action | Effort | Risk |
|------|--------|--------|------|
| 4.1 | Create `firebase/functions/package.json` | 1 hour | Low |
| 4.2 | Create `firebase/functions/src/onMessageCreate.ts` | 8-16 hours | Medium |
| 4.3 | Deploy Cloud Function | 1 hour | Low |
| 4.4 | Test push notifications on both web and mobile | 4 hours | Medium |

**Result:** All clients receive push notifications automatically when messages are sent.

### 10.5 Phase 5: Fix Shared Issues (Important)

**Goal:** Fix issues that exist on both branches.

| Step | Action | Effort | Risk |
|------|--------|--------|------|
| 5.1 | Centralize conversation creation in `messagingService` | 4-8 hours | Medium |
| 5.2 | Replace manual message IDs with Firestore-generated IDs | 2-4 hours | Low |
| 5.3 | Add realtime conversation subscription | 2-4 hours | Low |
| 5.4 | Add conversation-level unread counts | 4-8 hours | Medium |
| 5.5 | Enable Firestore offline persistence | 1-2 hours | Low |

**Result:** Both apps benefit from the same fixes simultaneously.

### 10.6 Phase 6: State Management (Optional)

**Goal:** Create shared Zustand store for messaging state.

| Step | Action | Effort | Risk |
|------|--------|--------|------|
| 6.1 | Create `packages/shared-services/src/store/messaging.store.ts` | 8-16 hours | Medium |
| 6.2 | Update web messaging pages to use store | 4-8 hours | Medium |
| 6.3 | Update mobile messaging screens to use store | 4-8 hours | Medium |

**Result:** Both apps share the same state management for messaging.

---

## 11. Sprint Plan

### Sprint 1: Foundation (Week 1)
- Phase 1: Align branches (verify shared-services are identical)
- Phase 2: Merge adapter pattern (copy expo + web adapters)
- Phase 5.1: Centralize conversation creation

### Sprint 2: Mobile Messaging (Week 2-3)
- Phase 3: Build mobile messaging screens
- Phase 5.3: Add realtime conversation subscription

### Sprint 3: Notifications (Week 3-4)
- Phase 4: Add Cloud Functions for push notifications
- Phase 5.5: Enable offline persistence

### Sprint 4: Read State (Week 4-5)
- Phase 5.4: Add conversation-level unread counts
- Phase 5.2: Replace manual message IDs

### Sprint 5: Polish (Week 5-6)
- Phase 6: Create shared Zustand messaging store
- End-to-end testing on both platforms

---

## 12. Final Readiness Score

| Category | Score | Notes |
|----------|-------|-------|
| **Shared services alignment** | 10/10 | Identical on both branches |
| **Shared types alignment** | 10/10 | Identical on both branches |
| **Firebase alignment** | 10/10 | Identical on both branches |
| **Authentication alignment** | 9/10 | Same approach, minor file location differences |
| **Messaging backend** | 8/10 | Same service, but missing features (unread counts, pagination) |
| **Mobile messaging UI** | 0/10 | Does not exist on app branch |
| **Push notifications** | 3/10 | Adapter pattern exists but no delivery mechanism |
| **Offline support** | 0/10 | Not enabled on either branch |
| **State management** | 5/10 | Auth store shared, messaging store missing |
| **Code duplication** | 6/10 | Some duplication but manageable |

### Overall Readiness: 6.1/10

**The backend is ready. The mobile app is not.**

The shared-services layer is the same on both branches, which means:
- ✅ A mobile developer can import `messagingService` and use it immediately
- ✅ The same Firestore collections, indexes, and rules work for both
- ✅ The same authentication flow works for both
- ❌ Mobile messaging screens need to be built from scratch
- ❌ Push notifications need Cloud Functions to be implemented
- ❌ Offline support needs to be enabled

### Critical Path to 10/10

1. Build mobile messaging screens (reuses existing shared-services)
2. Add Cloud Functions for push notification delivery
3. Enable Firestore offline persistence
4. Add unread counts and realtime conversation subscriptions