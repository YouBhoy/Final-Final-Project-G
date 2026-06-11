# SPARTAN-G System Analysis Report

## Project Overview
**SPARTAN-G** is a multi-platform learning management system with a monorepo architecture. It supports three roles (Student, Facilitator, Super Admin) across two platforms (Mobile via Expo, Web via Vite + React) with a shared Firebase backend.

---

## 1. Monorepo Structure

```
spartan-g/
├── apps/
│   ├── mobile/          # Expo (iOS/Android) — Student + Facilitator
│   │   └── src/navigation/  # AuthNavigator, StudentNavigator, FacilitatorNavigator, RootNavigator
│   └── web/             # Vite React — Student, Facilitator, Super Admin
│       ├── src/pages/       # LoginPage, RegisterPage, ForgotPasswordPage, DashboardPage
│       ├── src/navigation/  # AppRouter, StudentPortalRoutes, FacilitatorPortalRoutes, SuperAdminPortalRoutes
│       ├── src/components/  # auth/ (AuthLayout, ProtectedRoute), ui/ (Button, Input)
│       └── src/hooks/       # useAuth (web-specific)
├── packages/
│   ├── shared-types/    # Types, constants, RBAC functions, navigation types
│   │   └── src/
│   │       ├── constants/  # roles.ts, permissions.ts, platforms.ts, collections.ts
│   │       └── rbac/       # index.ts (permission checking, platform access validation)
│   ├── shared-services/ # Firebase init, repositories, services, Zustand store
│   │   └── src/
│   │       ├── firebase/   # Firebase SDK initialization
│   │       ├── repositories/ # BaseRepository + concrete repos
│   │       ├── services/   # Business logic services (auth, user, etc.)
│   │       └── store/      # Zustand stores (useAuthStore, useAppStore)
│   └── shared-ui/       # Design tokens, theme factory, role guard logic
├── firebase/            # Security rules + indexes
└── package.json         # npm workspaces root
```

## 2. Role-Based Access Control (RBAC)

### Roles
| Role | Mobile | Web | Access Level |
|------|--------|-----|-------------|
| `student` | ✅ | ✅ | 1 (lowest) |
| `facilitator` | ✅ | ✅ | 2 |
| `super_admin` | ❌ | ✅ | 3 (highest) |

### Platform Enforcement
- **`PLATFORM_ROLE_ACCESS`** defines which roles can access which platforms
- **`requiresWebPortal()`** — super_admin is web-only, redirected on mobile via `WebOnlyScreen`
- **`assertPlatformAccess()`** — validates role-platform compatibility on sign-in
- **`ProtectedRoute`** (web component) — wraps role-specific routes with permission gating
- **Mobile `RootNavigator`** — blocks super_admin from accessing mobile flows

### Permission System
- `getRolePermissions(role)` — returns all permissions for a role
- `hasPermission(role, permission)` — checks specific permission
- `hasMinimumRole(userRole, requiredRole)` — checks role hierarchy level

## 3. Current Feature Implementation Status

### ✅ COMPLETED (Working)
- **Authentication flow**: Login, Register, Forgot Password (both mobile + web)
- **Navigation scaffolding**: All route structures defined for all roles/platforms
- **RBAC system**: Roles, permissions, platform access matrix fully defined
- **Firebase infrastructure**: SDK init, security rules, indexes configured
- **Shared Zustand stores**: authStore, appStore implemented
- **Protected routing**: Role-gated route wrappers working

### ❌ PLACEHOLDER / NOT YET IMPLEMENTED
- **Dashboard pages** — all three portals show a "Coming Soon" placeholder
- **Course management** — no course listings, creation, or enrollment
- **Assignment system** — no assignment CRUD or submission workflow
- **Messaging** — no chat/conversation UI
- **Risk Alerts** (facilitator) — no alert dashboard
- **Appointments** — no scheduling system
- **Work Hours Scheduling** — no facilitator work hour management
- **Notifications** — no in-app notification display
- **Admin features** — no user management, analytics, or audit log viewer
- **Mobile screens** — navigators exist but target placeholder screens

## 4. Key Architectural Patterns

### Data Flow
```
UI Components → Zustand Stores → Services → Repositories → Firebase
```

### Service Layer (shared-services)
- `BaseRepository<T>` — generic Firestore CRUD
- Concrete repos: UserRepository, CourseRepository, etc.
- Business services: AuthService, UserService, NotificationService, FacilitatorServices

### State Management
- `useAuthStore` — auth state, session, role
- `useAppStore` — app-wide state

## 5. Firestore Collections (15 total)
users, profiles, courses, enrollments, assignments, submissions, notifications, device_tokens, risk_alerts, appointments, conversations, messages, work_hours_schedules, announcements, audit_logs

## 6. Key Observations
1. **The architecture is solid** — clean separation of concerns, shared packages avoid code duplication
2. **Most features are scaffolded but empty** — the navigation and routing infrastructure is ready, just needs actual screen implementations
3. **RBAC is thorough** — platform-level, role-level, and permission-level checks all in place
4. **The dashboard is the only working non-auth page** — and it's a placeholder
5. **Firebase rules exist** — but may need updating as features are implemented
6. **Mobile and web share business logic** via `shared-services` and `shared-types`
7. **UI is separate per platform** — web uses Tailwind CSS, mobile uses React Native styles