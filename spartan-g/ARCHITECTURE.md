# SPARTAN-G Architecture

Multi-platform learning platform monorepo with shared Firebase backend and role-based access control.

## Deployment Targets

| # | Platform | Runtime | Role | Package |
|---|----------|---------|------|---------|
| 1 | Student Mobile App | Expo (iOS/Android) | `student` | `apps/mobile` |
| 2 | Student Web Portal | React + Vite | `student` | `apps/web` |
| 3 | Facilitator Mobile App | Expo (iOS/Android) | `facilitator` | `apps/mobile` |
| 4 | Facilitator Web Portal | React + Vite | `facilitator` | `apps/web` |
| 5 | Super Admin Web Portal | React + Vite | `super_admin` | `apps/web` (web only) |

All platforms share Firebase Authentication, Firestore, Storage, and FCM.

## Monorepo Structure

```
spartan-g/
├── apps/
│   ├── mobile/          # Expo — Student + Facilitator mobile
│   └── web/             # Vite React — Student + Facilitator + Super Admin web
├── packages/
│   ├── shared-types/    # Types, constants, schemas, RBAC, navigation types
│   ├── shared-services/ # Firebase, repositories, services, Zustand store
│   └── shared-ui/       # Design tokens, theme, cross-platform guards
├── firebase/            # Security rules + indexes
└── package.json         # npm workspaces root
```

## Architecture Layers

```
┌──────────────────────────────────────────────────────────┐
│  apps/mobile          │  apps/web                        │
│  (React Navigation)   │  (React Router)                  │
├───────────────────────┴──────────────────────────────────┤
│  Platform adapters (Expo FCM / Web FCM)                  │
├──────────────────────────────────────────────────────────┤
│  packages/shared-ui (theme tokens, role guard logic)     │
├──────────────────────────────────────────────────────────┤
│  packages/shared-services                                │
│    ├── Zustand store (auth, app)                         │
│    ├── Services (business logic)                         │
│    └── Repositories (Firestore CRUD)                     │
├──────────────────────────────────────────────────────────┤
│  packages/shared-types (types, RBAC, schemas)            │
├──────────────────────────────────────────────────────────┤
│  Firebase (Auth, Firestore, Storage, FCM)                │
└──────────────────────────────────────────────────────────┘
```

## Platform Access (RBAC)

| Role | Mobile | Web |
|------|--------|-----|
| `student` | ✅ | ✅ |
| `facilitator` | ✅ | ✅ |
| `super_admin` | ❌ (redirect to web) | ✅ |

Platform enforcement:
- `PLATFORM_ROLE_ACCESS` in `shared-types`
- `authService.assertPlatformAccess()` on sign-in
- Mobile `RootNavigator` blocks `super_admin`
- Web `AppRouter` routes all three roles

## Mobile Navigation (`apps/mobile`)

```
RootNavigator
├── Auth (Login, Register, ForgotPassword, WebOnlyRedirect)
├── Student (role: student)
│   ├── Tabs: Home, Courses, Assignments, Messages, Profile
│   └── Stack: CourseDetail, AssignmentDetail, ConversationDetail
└── Facilitator (role: facilitator)
    ├── Tabs: Dashboard, RiskAlerts, Appointments, Messaging, WorkHoursSchedule, Profile
    └── Stack: RiskAlertDetail, AppointmentDetail, ConversationDetail, ManageCourse, GradeSubmission
```

## Web Navigation (`apps/web`)

```
AppRouter
├── /login, /register, /forgot-password
├── /student/*     → Student Web Portal
├── /facilitator/* → Facilitator Web Portal
└── /admin/*       → Super Admin Web Portal (web only)
```

## Facilitator Features

| Feature | Mobile Tab | Web Route | Service |
|---------|-----------|-----------|---------|
| Risk Alerts | `RiskAlerts` | `/facilitator/risk-alerts` | `riskAlertService` |
| Appointment Notifications | `Appointments` | `/facilitator/appointments` | `appointmentService` |
| Messaging | `Messaging` | `/facilitator/messages` | `messagingService` |
| Work Hours Scheduling | `WorkHoursSchedule` | `/facilitator/work-hours` | `workHoursService` |

## Shared Packages

### `@spartan-g/shared-types`
- Domain types, Firestore document interfaces
- Roles, permissions, platform access matrix
- Firestore collection schemas
- Mobile + web navigation type definitions
- RBAC pure functions

### `@spartan-g/shared-services`
- Firebase SDK initialization
- `MessagingAdapter` interface (platform-injected)
- Repository pattern (`BaseRepository` + concrete repos)
- Business services (auth, user, notifications, facilitator features)
- Zustand global state (`useAuthStore`, `useAppStore`)

### `@spartan-g/shared-ui`
- Design tokens (colors, typography, spacing)
- `createTheme()` factory
- `evaluateRoleGuard()` cross-platform guard logic

## Firestore Collections

| Collection | Purpose |
|------------|---------|
| `users` | Auth-linked user records with role |
| `profiles` | Extended profile data |
| `courses` | Course catalog |
| `enrollments` | Student-course relationships |
| `assignments` | Course assignments |
| `submissions` | Student submissions |
| `notifications` | In-app + push notifications |
| `device_tokens` | FCM tokens per deployment target |
| `risk_alerts` | Facilitator risk alerts |
| `appointments` | Scheduled appointments |
| `conversations` | Messaging threads |
| `messages` | Individual messages |
| `work_hours_schedules` | Facilitator work hours + notification scheduling |
| `announcements` | Platform announcements |
| `audit_logs` | Admin audit trail |

## FCM / Push Notifications

Platform-specific adapters implement `MessagingAdapter`:

- **Mobile**: `apps/mobile/src/adapters/expo-messaging.adapter.ts` (Expo Notifications)
- **Web**: `apps/web/src/adapters/web-messaging.adapter.ts` (Firebase Messaging Web SDK)

Tokens stored in `device_tokens` with `deploymentTarget` field.

## Getting Started

```bash
# Install all workspaces
npm install

# Mobile (Student + Facilitator)
cp .env.example apps/mobile/.env
npm run mobile

# Web (Student + Facilitator + Super Admin)
cp .env.example apps/web/.env
npm run web
```

## Next Phase

Replace placeholder routes with real screens:
- `apps/mobile/src/screens/`
- `apps/web/src/pages/`
