# Mobile Development Contract

**Document Version:** 1.0  
**Date:** July 11, 2026  
**Status:** Permanent Architecture Contract - No Code Changes

---

## **🏆 GOLDEN RULE**

**Business logic belongs in shared packages. Platform logic belongs in platform apps. Never mix them.**

This single principle captures the entire architecture. All other rules in this document support this core tenet.

---

## 1. Purpose

### Why a Monorepo?

The SPARTAN-G project uses a monorepo architecture to:

1. **Share business logic** - Both Web and Mobile applications consume the same backend services, repositories, and business logic
2. **Maintain consistency** - Single source of truth for types, constants, and validation rules
3. **Enable independent evolution** - Each platform can evolve its UI independently while sharing core functionality
4. **Simplify dependency management** - Shared packages are versioned together, reducing version conflicts

### Platform Relationship

- **Web Application** (`apps/web`) and **Mobile Application** (`apps/mobile`) are **two separate applications**
- Both applications share **one backend** (Firebase)
- Both applications share **shared packages** (`shared-services`, `shared-types`, `shared-ui`)
- **No platform should ever break the other** - Changes to shared code must maintain backward compatibility

---

## 2. Single Sources of Truth

### Folders That Must Exist Only Once

| Folder | Purpose | Must Never Be Duplicated |
|--------|---------|------------------------|
| `packages/shared-services` | Firebase SDK wrappers, repositories, services, state management | ✅ |
| `packages/shared-types` | TypeScript types, interfaces, constants, utility functions | ✅ |
| `packages/shared-ui` | Design tokens, themes, spacing, typography | ✅ |
| `firebase/` | Security rules, indexes, configuration | ✅ |
| `firebase/firestore.rules` | Firestore security rules | ✅ |
| `firebase/firestore.indexes.json` | Firestore composite indexes | ✅ |

### What Must Never Be Duplicated

| Component | Location | Reason |
|-----------|----------|--------|
| Firebase configuration | `packages/shared-services/src/config/env.ts` | Single source of truth for all environment variables |
| Firebase initialization | `packages/shared-services/src/firebase/app.ts` | Single Firebase app instance |
| Firebase Auth wrapper | `packages/shared-services/src/firebase/auth.ts` | Single authentication interface |
| Firebase Firestore wrapper | `packages/shared-services/src/firebase/firestore.ts` | Single data access interface |
| Firebase Storage wrapper | `packages/shared-services/src/firebase/storage.ts` | Single storage interface |
| All repositories | `packages/shared-services/src/repositories/` | Single data access layer |
| All services | `packages/shared-services/src/services/` | Single business logic layer |
| RBAC system | `packages/shared-types/src/constants/permissions.ts` | Single permission source |
| Role definitions | `packages/shared-types/src/constants/roles.ts` | Single role source |
| Collection names | `packages/shared-types/src/constants/collections.ts` | Single collection name source |
| Risk evaluation engine | `packages/shared-types/src/utils/risk-evaluation.ts` | Single risk calculation source |
| Scoring algorithms | `packages/shared-types/src/utils/scoring.ts` | Single scoring source |
| Validation functions | `packages/shared-types/src/utils/validators.ts` | Single validation source |
| Error types | `packages/shared-types/src/utils/errors.ts` | Single error type source |

---

## 3. Platform Boundaries

### Web Owns

| Component | Location | Notes |
|-----------|----------|-------|
| Pages | `apps/web/src/pages/` | React components with web-specific styling |
| Navigation | `apps/web/src/navigation/` | React Router implementation |
| UI Components | `apps/web/src/components/ui/` | HTML elements, Tailwind CSS |
| Layout Components | `apps/web/src/components/layout/` | Web-specific layout (Sidebar, Header, PortalLayout) |
| Styles | `apps/web/src/styles/` | Tailwind CSS, global styles |
| Web Hooks | `apps/web/src/hooks/` | React-specific hooks (useAuth, etc.) |
| Browser APIs | N/A | localStorage, window, document (if needed) |

### Mobile Owns

| Component | Location | Notes |
|-----------|----------|-------|
| Screens | `apps/mobile/src/screens/` | React Native screen components |
| Navigation | `apps/mobile/src/navigation/` | React Navigation implementation |
| UI Components | `apps/mobile/src/components/ui/` | React Native primitives |
| Mobile Hooks | `apps/mobile/src/hooks/` | React Native-specific hooks |
| Expo APIs | N/A | Camera, notifications, secure storage |
| Native Permissions | N/A | Location, camera, contacts (if needed) |

### Cross-Platform Import Rules

**Web MUST NEVER import from:**
- `apps/mobile/**` - Mobile code is not compatible with web

**Mobile MUST NEVER import from:**
- `apps/web/**` - Web code is not compatible with React Native

**Both platforms MUST ONLY import from:**
- `packages/shared-services/**` - Shared business logic
- `packages/shared-types/**` - Shared types and utilities
- `packages/shared-ui/**` - Shared design tokens (when implemented)

---

## 4. Dependency Rules

### Import Matrix

| From \ To | shared-types | shared-services | shared-ui | web | mobile |
|-----------|--------------|-----------------|-----------|-----|--------|
| **web** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| **mobile** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| **shared-services** | ✅ Allowed | ❌ Forbidden* | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **shared-types** | ❌ Forbidden** | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **shared-ui** | ❌ Forbidden** | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |

\* `shared-services` can import from `shared-types` (corrected below)
\*\* `shared-types` and `shared-ui` are leaf packages with no dependencies

### Corrected Import Matrix

| From \ To | shared-types | shared-services | shared-ui |
|-----------|--------------|-----------------|-----------|
| **web** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **mobile** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **shared-services** | ✅ Allowed | ❌ Forbidden | ❌ Forbidden |
| **shared-types** | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **shared-ui** | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |

---

## 5. Forbidden Changes

### Changes That Should NEVER Happen

| Action | Reason |
|--------|--------|
| ❌ Duplicate Firebase config | Creates inconsistency, maintenance burden |
| ❌ Duplicate repositories | Data access logic must be shared |
| ❌ Duplicate business logic | Services must be the single source of truth |
| ❌ Duplicate RBAC | Permissions must be consistent across platforms |
| ❌ Copy services into mobile | Breaks the shared architecture |
| ❌ Move business logic into UI | Business logic must stay in shared-services |
| ❌ Import web code into mobile | Platform incompatibility |
| ❌ Import mobile code into web | Platform incompatibility |
| ❌ Create another auth implementation | `authService` is the single source of truth |
| ❌ Create another Firestore wrapper | `shared-services/firebase/` is the single source |
| ❌ Add platform-specific code to shared packages | Breaks platform-agnostic design |
| ❌ Modify shared-types without understanding impact | Types are used by both platforms |
| ❌ Modify shared-services without testing both platforms | Services are used by both platforms |

---

## 6. Shared Service Rules

### Data Access Layer

1. **All CRUD operations MUST happen through shared-services**
   - No direct Firestore access in `apps/web` or `apps/mobile`
   - No direct Firebase Storage access in platform code

2. **Repositories are the ONLY Firestore layer**
   - `BaseRepository` provides the foundation
   - All repositories extend `BaseRepository`
   - No platform may create its own repository

3. **Services are the ONLY business logic layer**
   - All business rules live in `packages/shared-services/src/services/`
   - Services use repositories for data access
   - Services use shared-types for types

4. **Service Method Signatures**
   - All service methods must accept `actorRole: Role` parameter
   - All service methods must validate permissions
   - All service methods must throw `PermissionError` for unauthorized access

---

## 7. UI Rules

### What Belongs in `shared-ui`

| Component | Allowed | Notes |
|-----------|---------|-------|
| Design tokens | ✅ Yes | Colors, spacing, typography values |
| Theme configuration | ✅ Yes | Light/dark mode definitions |
| Icon definitions | ✅ Yes | As constants or SVG data |
| Platform-independent assets | ✅ Yes | Images, fonts (as references) |
| React components | ❌ No | Platform-specific rendering |
| HTML elements | ❌ No | Web-only |
| React Native components | ❌ No | Mobile-only |
| Tailwind CSS | ❌ No | Web-only |
| StyleSheet | ❌ No | Mobile-only |

### What Belongs in `apps/web`

| Component | Location | Notes |
|-----------|----------|-------|
| Page components | `src/pages/` | React + Tailwind |
| UI components | `src/components/ui/` | HTML + Tailwind |
| Layout components | `src/components/layout/` | Web layout |
| Navigation | `src/navigation/` | React Router |
| Hooks | `src/hooks/` | React-specific |
| Styles | `src/styles/` | Tailwind CSS |

### What Belongs in `apps/mobile`

| Component | Location | Notes |
|-----------|----------|-------|
| Screen components | `src/screens/` | React Native |
| UI components | `src/components/ui/` | React Native primitives |
| Navigation | `src/navigation/` | React Navigation |
| Hooks | `src/hooks/` | React Native-specific |
| Adapters | `src/adapters/` | Platform-specific implementations |

---

## 8. Navigation Rules

### Navigation Must Never Be Shared

| Platform | Navigation System | Location |
|----------|-----------------|----------|
| Web | React Router | `apps/web/src/navigation/` |
| Mobile | React Navigation | `apps/mobile/src/navigation/` |

### Navigation Structure

**Web Navigation:**
- `AppRouter.tsx` - Main router with `BrowserRouter`
- `StudentPortalRoutes.tsx` - Student role routes
- `FacilitatorPortalRoutes.tsx` - Facilitator role routes
- `SuperAdminPortalRoutes.tsx` - Super admin role routes
- `ProtectedRoute.tsx` - Role-based route guard

**Mobile Navigation:**
- `RootNavigator.tsx` - Main navigator with role-based routing
- `AuthNavigator.tsx` - Authentication flow navigator
- `StudentNavigator.tsx` - Student tab + stack navigator
- `FacilitatorNavigator.tsx` - Facilitator tab + stack navigator
- `ProtectedRoute.tsx` - Role-based navigation guard

---

## 9. Authentication Rules

### Single Authentication Provider

1. **Firebase Auth is the ONLY authentication provider**
   - No custom auth implementations
   - No OAuth without Firebase
   - No JWT without Firebase

2. **There must NEVER be another authentication implementation**
   - `authService` in `shared-services` is the single source of truth
   - `useAuthStore` in `shared-services` is the single state source

3. **Web and Mobile both consume the same AuthService**
   - Both use `packages/shared-services/src/services/auth.service.ts`
   - Both use `packages/shared-services/src/firebase/auth.ts`

4. **Firestore stores profile data only**
   - User document: `users/{uid}` with role, displayName, isActive
   - Profile document: `profiles/{uid}` with extended data
   - **Passwords NEVER enter Firestore** - Firebase Auth handles credentials

5. **Session Management**
   - `onAuthStateChanged` handles session persistence
   - No manual token storage in platform code
   - Platform context is set via `setPlatform()` in auth store

---

## 10. State Management Rules

### Zustand Sharing

1. **Zustand stores are shared**
   - `useAuthStore` in `shared-services/src/store/auth.store.ts`
   - `useAppStore` in `shared-services/src/store/app.store.ts`

2. **Platform Context**
   - `setPlatform('web' | 'mobile')` must be called on app initialization
   - Platform context is used for deployment target resolution

3. **UI State Stays Local**
   - Form state, modal visibility, loading states
   - These belong in platform-specific code

4. **Business State Stays Shared**
   - User session, permissions, cached data
   - These belong in `shared-services`

---

## 11. Feature Development Workflow

### Implementation Order

Every new feature MUST be implemented in this order:

1. **shared-types**
   - Add new types/interfaces
   - Add new constants
   - Add new validation functions

2. **repositories**
   - Add new repository methods
   - Extend `BaseRepository` if needed

3. **services**
   - Add new service methods
   - Implement business logic
   - Add permission checks

4. **web UI**
   - Create pages/components
   - Add routes
   - Use shared services

5. **mobile UI**
   - Create screens/components
   - Add navigation
   - Use shared services

### Never the Reverse

- ❌ Do not start with UI
- ❌ Do not implement business logic in components
- ❌ Do not create platform-specific data access

---

## 12. Mobile Development Rules

### When Mobile Development Begins

1. **Do not edit web UI**
   - Web UI is independent
   - Changes to web UI are not required for mobile

2. **Do not edit web routing**
   - Web routing is independent
   - Mobile has its own navigation

3. **Do not rename shared services**
   - Service names must remain stable
   - Both platforms depend on them

4. **Do not modify repositories unless both platforms require it**
   - Repository changes affect both platforms
   - Only add methods, never break existing ones

5. **Do not introduce breaking API changes**
   - All changes must be backward compatible
   - Add new methods, deprecate old ones

6. **Do not add platform-specific code to shared packages**
   - Shared packages must remain platform-agnostic
   - Use adapters in platform code instead

---

## 13. Breaking Change Policy

### When shared-services or shared-types Must Change

1. **List exactly what downstream code is affected**
   - `apps/web/src/pages/**`
   - `apps/web/src/components/**`
   - `apps/mobile/src/screens/**`
   - `apps/mobile/src/components/**`

2. **Update shared packages first**
   - Shared packages are the reference implementation
   - Web and Mobile are equal consumers of shared packages
   - Verify shared package changes work in both platforms

3. **Verify tests**
   - Run `npm run typecheck` in all packages
   - Run web application and verify functionality

4. **Only then allow mobile changes**
   - Mobile can be updated after web is verified
   - Mobile changes are optional if not needed

### Breaking Change Examples

| Change | Impact |
|--------|--------|
| Rename service method | Both platforms must update imports |
| Change method signature | Both platforms must update calls |
| Remove type | Both platforms must update usage |
| Change Firestore document structure | Both platforms must update |
| Modify security rules | Both platforms must handle new rules |

---

## 14. Pull Request Checklist

### Every Implementation Must Satisfy

- [ ] **Did this duplicate code?**
   - No code was copied from one platform to another
   - No services were duplicated
   - No repositories were duplicated

- [ ] **Did this modify shared services?**
   - If yes, was it backward compatible?
   - If yes, was web tested?
   - If yes, is mobile affected?

- [ ] **Does it break web?**
   - Web application compiles
   - Web application runs
   - Web tests pass

- [ ] **Does it break mobile?**
   - Mobile application compiles (if exists)
   - Mobile application runs (if exists)
   - Mobile tests pass (if exists)

- [ ] **Can both platforms compile?**
   - `npm run typecheck` passes in all packages
   - No TypeScript errors

- [ ] **Did shared-types change?**
   - If yes, was it backward compatible?
   - If yes, was it necessary?

- [ ] **Were services modified?**
   - If yes, was it in shared-services?
   - If yes, was permission checking added?

- [ ] **Was Firebase affected?**
   - If yes, were security rules updated?
   - If yes, were indexes updated?

- [ ] **Does it follow the import matrix?**
   - No cross-platform imports
   - Only shared package imports

- [ ] **Is business logic in shared-services?**
   - No business logic in UI
   - No business logic in platform code

---

## 15. AI Instructions

### For Future AI Assistants

1. **Never rewrite architecture without approval**
   - The monorepo structure is intentional
   - Do not propose "simpler" alternatives

2. **Never duplicate services**
   - `authService`, `appointmentService`, etc. are shared
   - Do not create `mobileAuthService` or similar

3. **Never replace repositories**
   - `userRepository`, `appointmentRepository`, etc. are shared
   - Do not create platform-specific repositories

4. **Never move logic into UI**
   - Business logic belongs in `shared-services`
   - UI belongs in platform-specific code

5. **Always audit before refactoring**
   - Check what platforms use the code
   - Check for breaking changes

6. **Always prefer extending shared code over copying code**
   - Add new methods to services
   - Add new types to shared-types
   - Do not copy-paste between platforms

7. **Always preserve backward compatibility**
   - Add new methods, don't change existing ones
   - Deprecate old methods with comments
   - Never remove without deprecation

8. **Always explain architectural impact before changing shared packages**
   - "This change affects both web and mobile"
   - "This change requires updates in X files"
   - "This change is backward compatible"

9. **Never import from `apps/web` in mobile code**
   - React components don't work in React Native
   - Tailwind CSS doesn't work in React Native

10. **Never import from `apps/mobile` in web code**
    - React Native components don't work in React
    - Expo APIs don't work in web

11. **When in doubt, ask for clarification**
    - "Should this be in shared-services or platform code?"
    - "Is this a breaking change?"
    - "Does this follow the import matrix?"

---

## 16. Quick Reference

### Commands

```bash
# Type check all packages
npm run typecheck

# Build web
npm run build:web

# Start web development
npm run web

# Start mobile development (when ready)
npm run mobile
```

### Key Files

| File | Purpose |
|------|---------|
| `packages/shared-services/src/index.ts` | All shared exports |
| `packages/shared-types/src/index.ts` | All type exports |
| `packages/shared-services/src/config/env.ts` | Environment configuration |
| `firebase/firestore.rules` | Security rules |
| `firebase/firestore.indexes.json` | Firestore indexes |

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│  apps/web                           apps/mobile          │
│  (React + Vite)                     (React Native + Expo)│
│  ┌─────────────────┐                ┌─────────────────┐ │
│  │     pages/      │                │    screens/     │ │
│  │   components/   │                │   components/   │ │
│  │   navigation/   │                │   navigation/   │ │
│  └────────┬────────┘                └────────┬────────┘ │
│           │                                   │          │
└───────────┼───────────────────────────────────┼───────────┘
            │                                   │
            ▼                                   ▼
┌──────────────────────────────────────────────────────────┐
│  packages/shared-services                                 │
│  ┌─────────────────┐                                     │
│  │    services/    │  ← Business Logic Layer              │
│  │  repositories/  │  ← Data Access Layer                 │
│  │     store/      │  ← State Management                  │
│  │    firebase/    │  ← Firebase SDK Wrappers             │
│  └────────┬────────┘                                     │
│           │                                                │
└───────────┼─────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────┐
│  packages/shared-types                                    │
│  ┌─────────────────┐                                     │
│  │     types/      │  ← TypeScript Interfaces               │
│  │   constants/    │  ← Roles, Permissions, Collections     │
│  │     utils/      │  ← Pure Functions (Risk, Scoring)      │
│  └─────────────────┘                                     │
└──────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────┐
│  Firebase Backend                                         │
│  ┌─────────────────┐                                     │
│  │  Authentication   │                                     │
│  │  Firestore        │                                     │
│  │  Storage          │                                     │
│  │  Cloud Messaging  │                                     │
│  └─────────────────┘                                     │
└──────────────────────────────────────────────────────────┘
```

---

## 17. Public API Stability

### Shared Packages as Published Libraries

The following packages expose a **public API** that should be treated as if they were published npm libraries:

- `packages/shared-services`
- `packages/shared-types`

### API Stability Rules

| Rule | Description |
|------|-------------|
| **Never rename exported methods without deprecation** | Add `@deprecated` JSDoc comment, keep old method as wrapper |
| **Never remove exported types without migration** | Mark as `@deprecated`, provide migration path |
| **Never change method signatures unless absolutely necessary** | Prefer adding optional parameters |
| **Prefer adding new methods instead of replacing existing ones** | Extend, don't replace |
| **All changes must be backward compatible** | Existing callers must continue to work |

### Example: Safe API Evolution

```typescript
// Before
export async function getTemplate(templateId: string, actorRole: Role) { }

// After - Adding optional parameter (safe)
export async function getTemplate(
  templateId: string, 
  actorRole: Role,
  options?: { includeQuestions?: boolean }
) { }

// After - Renaming with deprecation (safe)
/** @deprecated Use getTemplateById instead */
export async function getTemplate(templateId: string, actorRole: Role) {
  return getTemplateById(templateId, actorRole);
}
export async function getTemplateById(templateId: string, actorRole: Role) { }
```

---

## 18. Version Shared Packages

### Semantic Versioning

Shared packages follow semantic versioning:

| Change Type | Version Bump |
|-------------|--------------|
| Breaking change | Major (1.0.0 → 2.0.0) |
| New functionality | Minor (1.0.0 → 1.1.0) |
| Bug fix | Patch (1.0.0 → 1.0.1) |

### Breaking Change Requirements

Every breaking change requires:

1. **Architecture review** - Document the change and rationale
2. **Migration notes** - Document how to update callers
3. **Impact analysis** - List all affected files in both platforms

### Version Tracking

Even though packages are not published to npm, version changes should be tracked in:
- `packages/shared-services/CHANGELOG.md`
- `packages/shared-types/CHANGELOG.md`

---

## 19. Firestore Schema Contract

### Document Schemas Are Contracts

Firestore document schemas defined in `shared-types` are **immutable contracts**:

| Rule | Description |
|------|-------------|
| **Never rename fields** | Existing documents would break |
| **Never delete fields** | Old documents would have missing data |
| **Only add optional fields** | New fields must be optional |
| **Migration scripts required for incompatible changes** | Use Firebase Admin SDK for migrations |

### Schema Evolution Example

```typescript
// ✅ Safe - Adding optional field
export interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  // New optional field - safe
  lastLoginAt?: Timestamp;
}

// ❌ Unsafe - Renaming field
export interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  // This breaks existing documents!
  lastSeen: Timestamp; // was lastLoginAt
}
```

### Migration Process

For incompatible changes:
1. Create migration script in `firebase/migrations/`
2. Run against production database
3. Update schema in shared-types
4. Update all service code

---

## 20. Cloud Functions

### Future Backend Code

When Cloud Functions are added, they will live in:

```
functions/
├── src/
│   ├── index.ts           # Function exports
│   ├── notification.ts    # Push notifications
│   ├── scheduled.ts       # Scheduled jobs
│   ├── analytics.ts       # Analytics processing
│   └── email.ts           # Email sending
├── package.json
└── tsconfig.json
```

### Function Rules

| Rule | Description |
|------|-------------|
| **Cloud Functions are backend code** | Not frontend code |
| **Never import from Web** | `apps/web/**` is frontend only |
| **Never import from Mobile** | `apps/mobile/**` is frontend only |
| **Can import shared-services** | For business logic |
| **Can import shared-types** | For types and constants |

---

## 21. Testing Requirements

### Shared Services Testing

Every `shared-services` change must pass:

| Check | Command |
|-------|---------|
| ✅ TypeScript | `npm run typecheck` |
| ✅ Lint | `npm run lint` |
| ✅ Existing unit tests | `npm run test` |
| ✅ Repository tests | `npm run test -- repositories` |
| ✅ Service tests | `npm run test -- services` |
| ✅ Manual verification in Web | Run web app, test feature |
| ✅ Manual verification in Mobile | Run mobile app, test feature (when available) |

### Test Commands

```bash
# All tests
npm run test

# Type check
npm run typecheck

# Lint
npm run lint

# Build all packages
npm run build
```

---

## 22. Feature Ownership

### Feature Owners

| Feature | Owner | Location |
|---------|-------|----------|
| **Authentication** | `authService` | `packages/shared-services/src/services/auth.service.ts` |
| **User Management** | `userService` | `packages/shared-services/src/services/user.service.ts` |
| **Appointments** | `appointmentService` | `packages/shared-services/src/services/appointment.service.ts` |
| **Appointment Slots** | `appointmentSlotService` | `packages/shared-services/src/services/appointment-slot.service.ts` |
| **Work Hours** | `workHoursService` | `packages/shared-services/src/services/work-hours.service.ts` |
| **Messaging** | `messagingService` | `packages/shared-services/src/services/messaging.service.ts` |
| **Risk Engine** | `risk-evaluation.ts` | `packages/shared-types/src/utils/risk-evaluation.ts` |
| **Assessments** | `assessmentService` | `packages/shared-services/src/services/assessment.service.ts` |
| **Assessment Templates** | `assessmentTemplateService` | `packages/shared-services/src/services/assessment-template.service.ts` |
| **Assessment Responses** | `assessmentResponseService` | `packages/shared-services/src/services/assessment-response.service.ts` |
| **Risk Alerts** | `riskAlertService` | `packages/shared-services/src/services/risk-alert.service.ts` |
| **Facilitator-Student Links** | `facilitatorStudentLinkService` | `packages/shared-services/src/services/facilitator-student-link.service.ts` |
| **Notifications** | `notificationService` | `packages/shared-services/src/services/notification.service.ts` |
| **Firebase** | `firebase/` | `packages/shared-services/src/firebase/` |
| **RBAC** | `permissions.ts` | `packages/shared-types/src/constants/permissions.ts` |

### Ownership Responsibilities

- Feature owner maintains the service/repository
- Feature owner reviews changes to their feature
- Feature owner documents breaking changes

---

## 23. Allowed Shared Packages

### Current Shared Packages

| Package | Purpose |
|---------|---------|
| `shared-services` | Firebase, repositories, services, state |
| `shared-types` | Types, constants, utilities |
| `shared-ui` | Design tokens, themes |

### Future Shared Packages (Reserved)

| Package | Purpose |
|---------|---------|
| `shared-config` | Shared configuration (reserved) |
| `shared-hooks` | Shared React hooks (reserved) |
| `shared-testing` | Shared test utilities (reserved) |
| `shared-assets` | Shared assets, icons (reserved) |

### Package Creation Policy

**No additional shared package may be created without architectural review.**

- All new shared packages require documentation
- All new shared packages require justification
- All new shared packages must be platform-agnostic

---

## 24. Sign-off

This document serves as the **permanent architecture contract** for the SPARTAN-G monorepo. Any violation of these rules risks breaking the shared architecture and causing inconsistencies between the Web and Mobile platforms.

**Last Updated:** July 11, 2026  
**Next Review:** When mobile development begins
