# SPARTAN-G System Architecture Analysis Report

**Generated**: June 25, 2026
**Project**: Final-Final-Project-G / spartan-g
**Type**: Multi-platform mental health & learning support platform

---

## 1. Executive Summary

SPARTAN-G is a **multi-platform mental health and learning support platform** built as an **npm workspaces monorepo**. It serves three distinct user roles (Student, Facilitator, Super Admin) across two runtime platforms (Mobile via Expo/React Native, Web via React + Vite), all connected to a shared **Firebase backend** (Auth, Firestore, Storage, FCM).

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT TARGETS                        │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Student App    │  │  Facilitator App │  │  Super Admin     │  │
│  │  (Mobile + Web)  │  │ (Mobile + Web)   │  │  (Web Only)      │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
├──────────────────────────────────────────────────────────────────┤
│                        FRONTEND LAYER                            │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  apps/web (React + Vite)      apps/mobile (Expo/RN)         │ │
│  │  ├── Route Guards (ProtectedRoute)                          │ │
│  │  ├── Role-based Navigation/UI Rendering                     │ │
│  │  └── Platform Adapters (FCM Web / Expo Notifications)       │ │
│  └──────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│                        SHARED PACKAGES                           │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  shared-ui     │  shared-services    │  shared-types         │ │
│  │  (Theme,       │  (Firebase, repos,  │  (Types, RBAC,        │ │
│  │   Guards)      │   services, store)  │   schemas, constants) │ │
│  └──────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│                        SECURITY LAYER (3-tier)                   │
│  ┌─ 1. Frontend Route Guards & Permission Checks ───────────────┐│
│  ├─ 2. Service Layer Permission Enforcement (hasPermission())   ┤│
│  ├─ 3. Firestore Security Rules (server-enforced, unbypassable) ┤│
│  └──────────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────────┤
│                     FIREBASE BACKEND                              │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Firebase Auth  │  Firestore (NoSQL)  │  Storage  │  FCM     │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Monorepo Structure & Package Relationships

```
spartan-g/
│
├── spartan-g/package.json          ← npm workspaces root (manages all workspaces)
│                                                                                                   
├── apps/                           ← DEPLOYABLE APPLICATIONS
│   ├── mobile/                     ← @spartan-g/mobile (Expo/React Native)
│   │   ├── app.config.ts           ← Build configuration
│   │   ├── index.ts                 ← Entry point
│   │   └── src/                    ← Screens, navigation, adapters
│   │       ├── adapters/           ← expo-messaging.adapter.ts (FCM for mobile)
│   │       └── screens/            ← Student & Facilitator screens
│   │
│   └── web/                        ← @spartan-g/web (React + Vite)
│       ├── vite.config.ts           ← Build configuration
│       ├── index.html               ← HTML shell
│       └── src/
│           ├── main.tsx             ← Entry point
│           ├── app/App.tsx          ← App shell
│           ├── adapters/            ← web-messaging.adapter.ts (FCM for web)
│           ├── components/          ← UI components, auth guards, layouts
│           │   ├── auth/ProtectedRoute.tsx  ← Role-based route gating
│           │   ├── layout/          ← Sidebar, portal layouts
│           │   ├── assessment/     ← Assessment UI components
│           │   └── ui/             ← Generic UI components
│           ├── hooks/               ← useAuth.tsx, useAssessment*.ts
│           ├── navigation/          ← AppRouter, portal-specific route trees
│           │   ├── AppRouter.tsx    ← Master router (auth + 3 portals)
│           │   ├── StudentPortalRoutes.tsx
│           │   ├── FacilitatorPortalRoutes.tsx
│           │   ├── SuperAdminPortalRoutes.tsx
│           │   └── navConfigs.ts   ← Sidebar nav items per role
│           ├── pages/              ← Page components by portal
│           │   ├── student/        ← Student pages
│           │   ├── facilitator/    ← Facilitator pages
│           │   ├── admin/          ← Super Admin pages
│           │   ├── assessment/     ← Assessment wizard pages
│           │   └── dev/SeederPage.tsx  ← Dev seeding tool
│           ├── providers/AppProviders.tsx  ← Context providers
│           ├── styles/global.css
│           ├── types/auth.types.ts
│           ├── lib/                ← Utility libraries
│           └── firebase/firebase.ts ← Firebase init for web
│
├── packages/                       ← SHARED LIBRARIES (internal packages)
│   │
│   ├── shared-types/               ← @spartan-g/shared-types
│   │   ├── package.json            ← Depends on: (none — pure TypeScript)
│   │   └── src/
│   │       ├── index.ts            ← Re-exports everything
│   │       ├── constants/          ← Static definitions
│   │       │   ├── roles.ts        ← ROLES.STUDENT, FACILITATOR, SUPER_ADMIN + hierarchy
│   │       │   ├── permissions.ts  ← PERMISSIONS matrix + ROLE_PERMISSIONS map
│   │       │   ├── platforms.ts    ← PLATFORMS, PLATFORM_ROLE_ACCESS, DeploymentTargets
│   │       │   ├── collections.ts  ← Firestore collection name constants
│   │       │   └── firestore-schemas.ts
│   │       ├── types/              ← Domain interfaces & Firestore document shapes
│   │       │   ├── auth.types.ts   ← AuthCredentials, AuthSession, RegisterPayload
│   │       │   ├── user.types.ts   ← UserDocument, ProfileDocument
│   │       │   ├── firestore.types.ts  ← Base Firestore document interface
│   │       │   └── assessment.types.ts ← Phase 3A & 3B assessment types
│   │       ├── navigation/         ← Type definitions for navigation
│   │       │   ├── mobile.types.ts
│   │       │   └── web.types.ts
│   │       ├── rbac/index.ts       ← Pure RBAC functions (hasPermission, canAccessPlatform, etc.)
│   │       └── utils/              ← Scoring, validators, error types
│   │
│   ├── shared-services/            ← @spartan-g/shared-services
│   │   ├── package.json            ← Depends on: @spartan-g/shared-types, firebase, zustand
│   │   └── src/
│   │       ├── index.ts            ← Re-exports everything
│   │       ├── config/env.ts       ← Environment variable resolution, deployment target
│   │       ├── firebase/           ← Firebase client initialization
│   │       │   ├── app.ts          ← getFirebaseApp() singleton
│   │       │   ├── auth.ts         ← getFirebaseAuth()
│   │       │   ├── firestore.ts    ← getFirestoreDb(), Firestore utilities
│   │       │   ├── storage.ts      ← getFirebaseStorage()
│   │       │   └── messaging-adapter.ts  ← MessagingAdapter interface
│   │       ├── repositories/       ← Data access layer (Repository Pattern)
│   │       │   ├── base.repository.ts   ← Abstract BaseRepository<T> (CRUD + real-time)
│   │       │   ├── user.repository.ts
│   │       │   ├── profile.repository.ts
│   │       │   ├── assessment.repository.ts          ← Phase 3A attempt shells
│   │       │   ├── assessment-template.repository.ts  ← Phase 3A templates
│   │       │   ├── assessment-question.repository.ts  ← Phase 3A questions
│   │       │   ├── assessment-response.repository.ts  ← Phase 3A responses
│   │       │   ├── assessment-attempt.repository.ts   ← Phase 3B attempts
│   │       │   ├── appointment.repository.ts
│   │       │   ├── conversation.repository.ts
│   │       │   ├── message.repository.ts
│   │       │   ├── risk-alert.repository.ts
│   │       │   ├── device-token.repository.ts
│   │       │   └── work-hours.repository.ts
│   │       ├── services/           ← Business logic layer
│   │       │   ├── auth.service.ts          ← Sign-in, register, session building, platform assertion
│   │       │   ├── user.service.ts           ← User CRUD, permission-checks
│   │       │   ├── assessment.service.ts     ← Phase 3A & 3B assessment orchestration
│   │       │   ├── assessment-template.service.ts
│   │       │   ├── assessment-response.service.ts
│   │       │   ├── appointment.service.ts
│   │       │   ├── messaging.service.ts
│   │       │   ├── notification.service.ts
│   │       │   ├── risk-alert.service.ts
│   │       │   ├── storage.service.ts
│   │       │   └── work-hours.service.ts
│   │       └── store/              ← Global state (Zustand)
│   │           ├── auth.store.ts   ← useAuthStore (AuthSession, signIn, register, etc.)
│   │           ├── app.store.ts    ← useAppStore
│   │           └── index.ts
│   │
│   └── shared-ui/                  ← @spartan-g/shared-ui
│       ├── package.json            ← Depends on: @spartan-g/shared-types
│       └── src/
│           ├── index.ts
│           ├── theme/              ← Design system
│           │   ├── colors.ts       ← Color tokens
│           │   ├── typography.ts   ← Font sizes, families
│           │   └── spacing.ts      ← Spacing tokens
│           └── guards/              ← Cross-platform role guard logic
│               └── role-guard.ts   ← evaluateRoleGuard()
│
└── firebase/                       ← Firebase infrastructure config
    ├── firestore.rules             ← Server-enforced security rules
    ├── firestore.indexes.json      ← Composite indexes
    └── firebase.json               ← Firebase project config
```

---

## 4. Package Dependency Graph

```
                    ┌─────────────────┐
                    │  shared-types   │  ← Pure TypeScript: types, constants, RBAC, utils
                    └────────┬────────┘
                             │ depends on
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
   ┌─────────────────┐ ┌──────────┐ ┌──────────────┐
   │ shared-services │ │ shared-ui│ │    apps/*    │
   │ (Firebase,      │ │ (Theme,  │ │ (Mobile, Web)│
   │  repos, store)  │ │  Guards) │ │              │
   └────────┬────────┘ └──────────┘ └──────────────┘
            │ depends on
            ▼
   ┌─────────────────┐
   │  Firebase SDK   │  (firebase, @firebase/*)
   │  + Zustand      │
   └─────────────────┘
```

**Key relationships:**
- **shared-types** is the foundation package — zero runtime dependencies, used by everything
- **shared-services** builds on shared-types, adding Firebase initialization, repository layer, business services, and Zustand stores
- **shared-ui** builds on shared-types, providing design tokens and cross-platform guard logic
- **apps/web** and **apps/mobile** consume all three shared packages + platform-specific tooling (Vite/Expo)

---

## 5. Security Architecture (3-Tier Model)

### Tier 1: Frontend (React)
| Mechanism | Where | What it does |
|-----------|-------|-------------|
| Route guards | `components/auth/ProtectedRoute.tsx` | Blocks routes by required role |
| Service permission checks | All `services/*.ts` | `hasPermission()` before Firestore calls |
| Conditional UI rendering | Navigation/navConfigs | Only shows sidebar options the user's role can access |
| Platform assertion | `authService.assertPlatformAccess()` | Blocks super_admin on mobile at sign-in |

### Tier 2: Service Layer (shared-services)
- Every service method calls `hasPermission(actorRole, PERMISSION)` before executing
- Throws `PermissionError` if the caller lacks the required permission
- Repository methods do NOT check permissions — that's the service layer's job

### Tier 3: Firestore Security Rules (Server-Enforced)
- Helper functions: `isAuthenticated()`, `isActiveUser()`, `isStudent()`, `isFacilitator()`, `isSuperAdmin()`, `isFacilitatorOrAdmin()`
- Each collection has granular read/write/create/update/delete rules
- Students can only read/write their own documents (by `studentId == request.auth.uid`)
- Facilitators/admins have broader access depending on the collection
- Audit logs are append-only (no update/delete)
- `isActive` check prevents deactivated accounts from accessing data

**Key principle**: Even if client code is bypassed, Firestore rules still enforce access at the database level.

---

## 6. Data Flow Patterns

### 6.1 Authentication Flow
```
User → Login Form → authStore.signIn()
  ├─ authService.signIn(credentials, platform)
  │    ├─ Firebase Auth: signInWithEmailAndPassword()
  │    ├─ authService.buildSession(firebaseUser)
  │    │    ├─ userRepository.getById(uid) → reads users/{uid}
  │    │    ├─ Validates isActive == true
  │    │    └─ Returns AuthSession with role
  │    ├─ authService.assertPlatformAccess(role, platform)
  │    └─ Returns AuthSession
  └─ authStore → updates Zustand state (session, status='authenticated')
       → AppRouter reads role → redirects to /student/*, /facilitator/*, or /admin/*
```

### 6.2 Feature Access Flow
```
User navigates → ProtectedRoute checks user.role ∈ allowedRoles
  ↓
Component renders → Service method called with (data, actorRole)
  ↓
Service checks hasPermission(actorRole, PERMISSION) → PermissionError if denied
  ↓
Repository performs Firestore CRUD operation
  ↓
Firestore Security Rules validate server-side → block if unauthorized
  ↓
Data returned to component → UI renders
```

### 6.3 Assessment Flow (Phase 3A — Template-Based)
```
Student browses templates → /student/assessments
  ↓
Clicks "Start" on template → assessmentService.startAssessment(templateId, studentId, role)
  ├─ Checks for existing in-progress attempt (resume support)
  ├─ Creates assessment attempt shell in 'assessments' collection
  └─ Returns assessmentId
  ↓
Student answers questions → assessmentResponseRepository.create()
  └─ Responses stored in 'assessment_responses' collection
  ↓
Student clicks "Complete Section" → assessmentService.submitAssessment()
  ├─ Validates all required questions answered
  └─ Updates status to 'submitted' + responseCount
  ↓
Review & Submit → Final submission
```

### 6.4 Assessment Flow (Phase 3B — Course-Based/Wizard)
```
Super Admin seeds assessment definition → 'assessments' collection (isPublished: true)
  ↓
Student selects assessment → assessmentService.startAttempt(assessmentId, studentId)
  ├─ Checks maxAttempts limit
  └─ Creates attempt in 'assessment_attempts' collection (status: 'in_progress')
  ↓
Student answers questions → assessmentService.saveAnswer(attemptId, answer)
  ├─ Upserts answers array (replaces or appends)
  └─ Updates 'assessment_attempts' document
  ↓
Student submits → assessmentService.submitAttempt(attemptId, answers)
  ├─ Idempotent: skips if already submitted/graded
  └─ Updates status to 'submitted' + submittedAt
```

---

## 7. Role-Based Access Control (RBAC) System

### Roles & Hierarchy
| Role | Hierarchy Level | Mobile | Web |
|------|:---------------:|:------:|:---:|
| **student** | 1 | ✅ | ✅ |
| **facilitator** | 2 | ✅ | ✅ |
| **super_admin** | 3 | ❌ (redirects to web) | ✅ |

### Permission Enforcement Points
1. **Route level**: `ProtectedRoute` component blocks entire route trees by role
2. **Component level**: Conditional rendering based on `user.role`
3. **Service level**: `hasPermission(role, permission)` gate before any business logic
4. **Firestore level**: Security rules evaluate role from `users/{uid}.role` + `isActive` status

### Firestore Collection Access Matrix (Simplified)

| Collection | Student | Facilitator | Super Admin |
|-----------|:-------:|:-----------:|:-----------:|
| `users` | Read own | Read all | Full CRUD |
| `profiles` | Read/write own | Read all | Full access |
| `courses` | Read published | Full CRUD | Full CRUD |
| `enrollments` | Read/write own | Read all | Full CRUD |
| `assessments` (attempts) | Read/write own | Read all | Full CRUD |
| `assessments` (definitions) | Read published | Read all | Create only |
| `assessment_attempts` | Read/write own | Read all | Full CRUD |
| `assessment_responses` | Read/write own | Read all | Full CRUD |
| `risk_alerts` | Read own | Full CRUD | Full CRUD + Delete |
| `appointments` | Read own | Full CRUD | Full CRUD |
| `conversations` | If participant | If participant | Full CRUD |
| `messages` | Read all, write own | Read all, write own | Full CRUD |
| `audit_logs` | ❌ | Create only | Read + Create |
| `notifications` | Read/write own | Create | Full CRUD |

---

## 8. Assessment System — Two-Phase Architecture

### Phase 3A: Template-Based Check-ins
| Concept | Collection | Purpose |
|---------|-----------|---------|
| Template | `assessment_templates` | Metadata (title, category, isActive) |
| Question | `assessment_questions` | Individual questions linked to template |
| Attempt | `assessments` | Student attempt shell (studentId, templateId, status) |
| Response | `assessment_responses` | Individual student answers |
| **Question types**: short_text, long_text, single_choice, multi_choice, scale_1_5, scale_1_10, yes_no |

**Creator**: Facilitators/Admins create templates and questions
**Taker**: Students select a template, answer questions, submit
**Resume**: In-progress attempts can be resumed

### Phase 3B: Course-Based Mental Health Screenings
| Concept | Collection | Purpose |
|---------|-----------|---------|
| Definition | `assessments` | Assessment with embedded questions (courseId, isPublished, questions[]) |
| Attempt | `assessment_attempts` | Student attempt (assessmentId, answers[], status) |
| **Question types**: multiple_choice, true_false, short_answer |

**Creator**: Only Super Admin can create definitions
**Taker**: Students select sections (PHQ-9, GAD-7, DASS-21), answer, review, submit
**Sections**: Grouped by question ID prefix (phq1-9, gad1-7, dass1-21)
**Attempt limits**: Configurable maxAttempts per definition

---

## 9. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Monorepo** | npm workspaces | Package management across apps & shared libs |
| **Language** | TypeScript 5.3 | Type safety across codebase |
| **Mobile** | Expo (React Native) | iOS/Android app development |
| **Web** | React 18 + Vite | Web portal development |
| **State** | Zustand | Lightweight global state management |
| **Backend** | Firebase (BaaS) | Auth, Firestore, Storage, FCM |
| **Security** | Firestore Rules | Server-enforced access control |
| **Routing (Web)** | React Router v6 | Client-side navigation |
| **Routing (Mobile)** | React Navigation | Mobile navigation |
| **FCM** | Firebase Cloud Messaging | Push notifications (platform-specific adapters) |

---

## 10. Startup & Deployment

```
start-system.bat / npm run web
  └─ Starts Vite dev server on localhost:5173
     ├─ /student/*  → Student Web Portal
     ├─ /facilitator/* → Facilitator Web Portal
     ├─ /admin/*     → Super Admin Web Portal
     └─ /dev/seed    → Dev data seeder

npm run mobile
  └─ Starts Expo dev server for mobile apps
```

---

## 11. Key Architectural Patterns & Decisions

1. **Repository Pattern**: All Firestore CRUD is abstracted behind `BaseRepository<T>`, providing consistent error handling with `RepositoryError` and real-time subscriptions via `onSnapshot`.

2. **Singleton Services**: All services (authService, assessmentService, etc.) are instantiated as module-level singletons, used throughout the app.

3. **Zustand Store**: `useAuthStore` is the single source of truth for auth state. The store encapsulates sign-in, registration, session building, and platform access assertion.

4. **Platform Adapters (Strategy Pattern)**: FCM messaging uses a `MessagingAdapter` interface with platform-specific implementations (Expo Notifications for mobile, Firebase Messaging Web SDK for web).

5. **Assessments Collection Dual-Use**: The `assessments` Firestore collection serves both Phase 3A (student attempt shells with `studentId`) and Phase 3B (assessment definitions with `isPublished`), differentiated by which fields exist on the document.

6. **3-Layer Security**: No single layer is trusted — the frontend gates UI, the service layer gates business logic, and Firestore rules gate the database.

7. **Workspace Isolation**: Each shared package is independently versioned and typed, allowing clean separation of concerns while sharing code across apps.

---

## 12. File Count Summary

| Directory | Files | Purpose |
|-----------|:-----:|---------|
| `packages/shared-types/src/` | ~20 | Types, constants, RBAC, utils |
| `packages/shared-services/src/` | ~30 | Firebase, 12 repositories, 10 services, store |
| `packages/shared-ui/src/` | ~6 | Theme tokens, role guards |
| `apps/web/src/` | ~35 | Pages, components, navigation, hooks, adapters |
| `apps/mobile/src/` | (not fully explored) | Screens, mobile navigation |
| **Total core source files** | **~90+** | |

---

## 13. Recommendations & Observations

- **Assessment collection dual-use** (`assessments` for both Phase 3A attempts and Phase 3B definitions) creates complexity in Firestore rules with multiple `allow read` conditions. Consider splitting into two collections or using a `type` discriminant field for clarity.
- **Firestore composite indexes** may be needed for queries ordering by `submittedAt` — the current code sorts in-memory to avoid index requirements.
- **The seeder page** (`/dev/seed`) has no authentication guard — it's a development-only tool.
- **Super Admin** is web-only, enforced at sign-in, route guard, and navigation levels.