# SPARTAN-G Architecture

React Native (Expo) + TypeScript learning platform with Firebase backend and role-based access control.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Expo SDK 52, React Native 0.76 |
| Language | TypeScript (strict) |
| Navigation | React Navigation 7 (native stack + bottom tabs) |
| State | Zustand |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| Files | Firebase Storage |
| Push | Expo Notifications + FCM (via EAS) |

## Folder Structure

```
spartan-g/
├── app.config.ts              # Expo configuration
├── index.ts                   # App entry point
├── firebase/
│   ├── firestore.rules        # Firestore security rules
│   ├── storage.rules          # Storage security rules
│   └── firestore.indexes.json # Composite indexes
├── src/
│   ├── app/                   # Root app + providers
│   ├── auth/                  # Auth provider, RBAC, hooks
│   ├── components/            # Reusable UI, layout, guards
│   ├── config/                # Environment configuration
│   ├── constants/             # Roles, permissions, collections
│   ├── firebase/              # Firebase SDK initialization
│   ├── hooks/                 # Shared hooks
│   ├── navigation/            # Role-based navigators
│   ├── repositories/          # Firestore data access (repository pattern)
│   ├── services/              # Business logic layer
│   ├── store/                 # Zustand global state
│   ├── theme/                 # Design tokens + ThemeProvider
│   ├── types/                 # TypeScript domain types
│   └── utils/                 # Errors, validators
```

## Architecture Layers

```
┌─────────────────────────────────────────────┐
│  Navigation (role-based routing)          │
├─────────────────────────────────────────────┤
│  Components + Hooks + Guards                │
├─────────────────────────────────────────────┤
│  Zustand Store (auth, app)                  │
├─────────────────────────────────────────────┤
│  Services (business logic)                  │
├─────────────────────────────────────────────┤
│  Repositories (Firestore CRUD)              │
├─────────────────────────────────────────────┤
│  Firebase SDK (auth, firestore, storage,    │
│               messaging)                    │
└─────────────────────────────────────────────┘
```

## Roles & RBAC

| Role | Key | Hierarchy |
|------|-----|-----------|
| Student | `student` | 1 |
| Facilitator | `facilitator` | 2 |
| Super Admin | `super_admin` | 3 |

Permissions are defined in `src/constants/permissions.ts` and mapped to roles. Use:

- `hasPermission(role, permission)` — check single permission
- `hasMinimumRole(userRole, requiredRole)` — hierarchy check
- `<RoleGuard>` — conditional UI rendering
- `usePermissions()` — hook for components

## Navigation Structure

```
RootNavigator (auth-gated)
├── AuthNavigator (unauthenticated)
│   ├── Login
│   ├── Register
│   └── ForgotPassword
├── StudentNavigator (role: student)
│   ├── StudentTabs (bottom tabs)
│   │   ├── StudentHome
│   │   ├── StudentCourses
│   │   ├── StudentAssignments
│   │   └── StudentProfile
│   ├── CourseDetail
│   └── AssignmentDetail
├── FacilitatorNavigator (role: facilitator)
│   ├── FacilitatorTabs
│   │   ├── FacilitatorDashboard
│   │   ├── FacilitatorCourses
│   │   ├── FacilitatorStudents
│   │   └── FacilitatorProfile
│   ├── ManageCourse
│   └── GradeSubmission
└── SuperAdminNavigator (role: super_admin)
    ├── SuperAdminTabs
    │   ├── AdminDashboard
    │   ├── AdminUsers
    │   ├── AdminAnalytics
    │   └── AdminSettings
    ├── UserDetail
    └── PlatformSettings
```

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `users` | Auth-linked user records with role |
| `profiles` | Extended profile data |
| `courses` | Course catalog |
| `enrollments` | Student-course relationships |
| `assignments` | Course assignments |
| `submissions` | Student assignment submissions |
| `notifications` | In-app notifications |
| `device_tokens` | FCM push tokens |
| `announcements` | Platform announcements |
| `audit_logs` | Admin audit trail |

## Authentication Flow

1. `AuthProvider` subscribes to Firebase `onAuthStateChanged`
2. On sign-in, `authService.buildSession()` loads user doc from Firestore
3. Session (uid, email, role) stored in `useAuthStore`
4. `RootNavigator` routes to role-specific navigator
5. Push token registered via `notificationService` on auth

## Environment Setup

1. Copy `.env.example` → `.env`
2. Fill Firebase config from Firebase Console
3. Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
4. Deploy rules: `firebase deploy --only firestore:rules,storage`

## Next Phase (Screens)

Replace `PlaceholderScreen` routes in navigators with real screen components under `src/screens/`.
