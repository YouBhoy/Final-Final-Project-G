# Mobile Application Readiness Audit

**Document Version:** 1.0  
**Date:** July 11, 2026  
**Status:** Documentation Only - No Code Changes

---

## Part 1 — Current Architecture Audit

### Project Structure

```
spartan-g/
├── apps/
│   ├── web/                 # Vite React — Student + Facilitator + Super Admin web
│   └── mobile/              # Placeholder for Expo mobile app (exists but minimal)
├── packages/
│   ├── shared-types/        # Types, constants, schemas, RBAC, navigation types
│   ├── shared-services/     # Firebase, repositories, services, Zustand store
│   └── shared-ui/           # Design tokens, theme (empty package)
├── firebase/                # Security rules + indexes
│   ├── firestore.rules
│   └── firestore.indexes.json
└── package.json             # npm workspaces root
```

### Reusable Code Analysis

#### ✅ Platform-Independent Code (Ready for Mobile)

| Component | Location | Status | Notes |
|-----------|----------|--------|-------|
| **Firebase Initialization** | `packages/shared-services/src/firebase/app.ts` | ✅ Ready | Uses `initializeApp` with environment config, no platform assumptions |
| **Firebase Auth** | `packages/shared-services/src/firebase/auth.ts` | ✅ Ready | Pure Firebase SDK exports, no browser-specific code |
| **Firebase Firestore** | `packages/shared-services/src/firebase/firestore.ts` | ✅ Ready | Pure Firestore SDK exports, no platform assumptions |
| **Firebase Storage** | `packages/shared-services/src/firebase/storage.ts` | ✅ Ready | Pure Storage SDK exports, no platform assumptions |
| **Environment Config** | `packages/shared-services/src/config/env.ts` | ✅ Ready | Supports both `EXPO_PUBLIC_*` and `VITE_*` env vars |
| **Base Repository** | `packages/shared-services/src/repositories/base.repository.ts` | ✅ Ready | Abstract class using only Firestore SDK |
| **All Repositories** | `packages/shared-services/src/repositories/*.ts` | ✅ Ready | Extend BaseRepository, use only shared Firestore |
| **All Services** | `packages/shared-services/src/services/*.ts` | ✅ Ready | Business logic only, no UI dependencies |
| **Zustand Store** | `packages/shared-services/src/store/*.ts` | ✅ Ready | Platform-agnostic state management |
| **Types & Constants** | `packages/shared-types/src/*` | ✅ Ready | Pure TypeScript, no runtime dependencies |
| **Risk Evaluation** | `packages/shared-types/src/utils/risk-evaluation.ts` | ✅ Ready | Pure functions, no platform dependencies |
| **Validators** | `packages/shared-types/src/utils/validators.ts` | ✅ Ready | Pure validation functions |
| **Scoring** | `packages/shared-types/src/utils/scoring.ts` | ✅ Ready | Pure scoring algorithms |

#### ⚠️ Partially Reusable Code

| Component | Location | Status | Notes |
|-----------|----------|--------|-------|
| **Auth Store** | `packages/shared-services/src/store/auth.store.ts` | ⚠ Needs review | Uses `onAuthStateChanged` from Firebase Auth - works on both platforms but needs platform context setup |
| **Notification Service** | `packages/shared-services/src/services/notification.service.ts` | ⚠ Needs review | May need platform-specific push notification adapters |

### Code That Should NOT Be Shared

| Component | Location | Status | Notes |
|-----------|----------|--------|-------|
| **Web Auth Hook** | `apps/web/src/hooks/useAuth.tsx` | ❌ Web-only | Uses React Context, `import.meta.env` - not compatible with React Native |
| **Web Auth Lib** | `apps/web/src/lib/auth.ts` | ❌ Web-only | Direct Firebase imports, uses `import.meta.env` - duplicates shared-services auth |
| **Web Router** | `apps/web/src/navigation/AppRouter.tsx` | ❌ Web-only | Uses `react-router-dom` - not compatible with React Native |
| **ProtectedRoute** | `apps/web/src/components/auth/ProtectedRoute.tsx` | ❌ Web-only | Uses React Router's `Navigate` component |
| **UI Components** | `apps/web/src/components/ui/*.tsx` | ❌ Web-only | Uses HTML elements, Tailwind CSS, browser APIs |
| **Pages** | `apps/web/src/pages/**/*.tsx` | ❌ Web-only | React components with web-specific styling |
| **CSS Styles** | `apps/web/src/styles/global.css` | ❌ Web-only | Tailwind CSS, browser-specific styles |

---

## Part 2 — Mobile Compatibility Audit

### Package Compatibility Matrix

| Package | Status | Reasoning |
|---------|--------|-----------|
| `@spartan-g/shared-types` | ✅ Ready for Mobile | Pure TypeScript types, constants, and utility functions. No platform-specific code. All types are compatible with React Native. |
| `@spartan-g/shared-services` | ✅ Ready for Mobile | Firebase SDK is fully compatible with React Native. All services use only Firebase SDK and pure TypeScript. The `env.ts` already supports both Expo and Vite environment variables. |
| `@spartan-g/shared-ui` | ⚠ Needs minor refactoring | Currently empty. Would need to be implemented with design tokens only (no Tailwind CSS). React Native cannot use Tailwind CSS directly. |
| `apps/web` | ❌ Web-only | Contains React-specific code, Tailwind CSS, browser APIs, and react-router-dom. Cannot be shared. |

### Service Compatibility Audit

| Service | Status | Reasoning |
|---------|--------|-----------|
| `authService` | ✅ Ready for Mobile | Uses Firebase Auth SDK which is fully compatible with React Native. The `auth.service.ts` in shared-services is the correct implementation to use. |
| `userService` | ✅ Ready for Mobile | Uses repositories and Firebase Storage SDK. Both are React Native compatible. |
| `notificationService` | ⚠ Needs minor refactoring | Currently only creates in-app notifications. Would need push notification adapter for mobile. |
| `storageService` | ✅ Ready for Mobile | Uses Firebase Storage SDK which is compatible with React Native. |
| `riskAlertService` | ✅ Ready for Mobile | Pure business logic using repositories. No platform dependencies. |
| `appointmentService` | ✅ Ready for Mobile | Pure business logic with Firestore transactions. Fully compatible. |
| `facilitatorStudentLinkService` | ✅ Ready for Mobile | Read-only service using repositories. Fully compatible. |
| `messagingService` | ✅ Ready for Mobile | Uses repositories and Firestore real-time listeners. Compatible with React Native. |
| `workHoursService` | ✅ Ready for Mobile | Pure business logic. Fully compatible. |
| `appointmentSlotService` | ✅ Ready for Mobile | Pure business logic. Fully compatible. |
| `assessmentTemplateService` | ✅ Ready for Mobile | Pure business logic. Fully compatible. |
| `assessmentService` | ✅ Ready for Mobile | Pure business logic with risk evaluation. Fully compatible. |
| `assessmentResponseService` | ✅ Ready for Mobile | Pure business logic. Fully compatible. |

### Repository Compatibility Audit

| Repository | Status | Reasoning |
|------------|--------|-----------|
| `BaseRepository` | ✅ Ready for Mobile | Abstract class using only Firestore SDK. Singleton pattern works on both platforms. |
| `userRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `profileRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `deviceTokenRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `riskAlertRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `appointmentRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `facilitatorStudentLinkRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `conversationRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `messageRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `workHoursRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `appointmentSlotRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `assessmentTemplateRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `assessmentQuestionRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `assessmentRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `assessmentResponseRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `assessmentAttemptRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |
| `notificationRepository` | ✅ Ready for Mobile | Extends BaseRepository. Fully compatible. |

### Utility Function Compatibility Audit

| Utility | Status | Reasoning |
|---------|--------|-----------|
| `risk-evaluation.ts` | ✅ Ready for Mobile | Pure functions, no platform dependencies. |
| `scoring.ts` | ✅ Ready for Mobile | Pure functions for PHQ-9, GAD-7, DASS-21 scoring. |
| `validators.ts` | ✅ Ready for Mobile | Pure validation functions. |
| `errors.ts` | ✅ Ready for Mobile | Error classes and utilities. |

---

## Part 3 — Web Dependencies

### Browser-Specific Dependencies Found

| Dependency | Location | Occurrences | Abstraction Strategy |
|------------|----------|-------------|---------------------|
| `import.meta.env` | `apps/web/src/firebase/firebase.ts` | 1 | Use `shared-services/src/config/env.ts` which supports both `EXPO_PUBLIC_*` and `VITE_*` |
| `VITE_FIREBASE_*` | `apps/web/src/firebase/firebase.ts` | 7 | Abstracted in `shared-services/src/config/env.ts` |
| `react-router-dom` | `apps/web/src/navigation/*.tsx` | Multiple | Use React Navigation for mobile. Create platform-specific navigation layer. |
| `localStorage` | Not found in codebase | 0 | Use AsyncStorage or SecureStore for mobile. No changes needed currently. |
| `window` | Not found in codebase | 0 | No direct usage. No changes needed. |
| `document` | Not found in codebase | 0 | No direct usage. No changes needed. |
| HTML elements | `apps/web/src/components/ui/*.tsx` | Multiple | Create React Native equivalents using `react-native` primitives. |
| Tailwind CSS | `apps/web/src/styles/global.css` | 1 | Use `shared-ui` package for design tokens. Implement with React Native StyleSheet. |

### Files Requiring Platform Abstraction

| File | Issue | Recommended Abstraction |
|------|-------|------------------------|
| `apps/web/src/hooks/useAuth.tsx` | React Context + `import.meta.env` | Create `apps/mobile/src/hooks/useAuth.ts` using Zustand store from shared-services |
| `apps/web/src/lib/auth.ts` | Duplicates shared-services auth | Remove and use `authService` from shared-services directly |
| `apps/web/src/navigation/AppRouter.tsx` | React Router | Create `apps/mobile/src/navigation/AppNavigator.tsx` with React Navigation |
| `apps/web/src/components/auth/ProtectedRoute.tsx` | React Router Navigate | Create `apps/mobile/src/components/auth/ProtectedRoute.tsx` with React Navigation |

---

## Part 4 — Authentication Audit

### Current Authentication Architecture

The project has **two authentication implementations**:

1. **Shared Services (Recommended)**: `packages/shared-services/src/services/auth.service.ts`
   - Uses `getFirebaseAuth()` from `packages/shared-services/src/firebase/auth.ts`
   - Platform-aware via `Platform` parameter
   - Platform access validation via `canAccessPlatform()`
   - Zustand store integration

2. **Web-Specific (Duplicate)**: `apps/web/src/lib/auth.ts`
   - Direct Firebase Auth imports
   - Uses `import.meta.env` for config
   - Duplicates functionality in shared-services

### Firebase Auth Compatibility

| Feature | Web Compatibility | Mobile Compatibility | Notes |
|---------|-----------------|---------------------|-------|
| `signInWithEmailAndPassword` | ✅ | ✅ | Firebase SDK supports both |
| `createUserWithEmailAndPassword` | ✅ | ✅ | Firebase SDK supports both |
| `signOut` | ✅ | ✅ | Firebase SDK supports both |
| `sendPasswordResetEmail` | ✅ | ✅ | Firebase SDK supports both |
| `onAuthStateChanged` | ✅ | ✅ | Firebase SDK supports both |
| `updateProfile` | ✅ | ✅ | Firebase SDK supports both |

### Firestore Rules Compatibility

The `firebase/firestore.rules` are **fully compatible** with both platforms:
- Rules are based on `request.auth.uid` and user document fields
- No platform-specific conditions in rules
- Role-based access control works identically

### Shared Services Authentication

| Component | Status | Notes |
|-----------|--------|-------|
| `authService` | ✅ Compatible | Works on both platforms |
| `useAuthStore` | ✅ Compatible | Zustand is platform-agnostic |
| `onAuthStateChanged` wrapper | ✅ Compatible | Firebase SDK function |
| `buildSession` | ✅ Compatible | Reads user document, no platform assumptions |
| `assertPlatformAccess` | ✅ Compatible | Pure function checking role against platform |

### Platform-Specific Authentication Requirements

| Feature | Web Implementation | Mobile Implementation |
|---------|-------------------|----------------------|
| Session persistence | Firebase Auth handles automatically | Firebase Auth handles automatically |
| Secure token storage | Browser-managed | Use SecureStore for sensitive data |
| Deep linking (password reset) | Not implemented | Use Expo Linking API |
| Biometric auth | Not applicable | Optional - use Expo LocalAuthentication |

---

## Part 5 — Navigation Separation

### Current Navigation Structure

**Web Navigation** (`apps/web/src/navigation/`):
```
AppRouter.tsx          # Main router with BrowserRouter
StudentPortalRoutes.tsx
FacilitatorPortalRoutes.tsx
SuperAdminPortalRoutes.tsx
ProtectedRoute.tsx     # Role-based route guard
```

**Recommended Mobile Navigation Structure**:
```
apps/mobile/
├── src/
│   ├── navigation/
│   │   ├── RootNavigator.tsx
│   │   ├── AuthNavigator.tsx
│   │   ├── StudentNavigator.tsx
│   │   ├── FacilitatorNavigator.tsx
│   │   └── ProtectedRoute.tsx
│   ├── screens/
│   │   ├── auth/
│   │   ├── student/
│   │   └── facilitator/
│   └── hooks/
```

### Navigation Audit

| Component | Current Status | Mobile Ready |
|-----------|--------------|--------------|
| `AppRouter.tsx` | ❌ Web-only (React Router) | No - needs React Navigation |
| `StudentPortalRoutes.tsx` | ❌ Web-only | No - needs React Navigation |
| `FacilitatorPortalRoutes.tsx` | ❌ Web-only | No - needs React Navigation |
| `SuperAdminPortalRoutes.tsx` | ❌ Web-only | No - super admin is web-only per architecture |
| `ProtectedRoute.tsx` | ❌ Web-only (uses Navigate) | No - needs React Navigation equivalent |

### Recommended Navigation Separation

**Web** (`apps/web/src/navigation/`):
- Keep all current React Router implementation
- Add role-based guards using `ProtectedRoute`

**Mobile** (`apps/mobile/src/navigation/`):
- Create `RootNavigator` with React Navigation
- Create `AuthNavigator` for auth screens
- Create `StudentNavigator` (tabs + stack)
- Create `FacilitatorNavigator` (tabs + stack)
- Create `ProtectedRoute` using React Navigation's navigation guards

---

## Part 6 — Shared Services Audit

### Service-by-Service Analysis

| Service | Mobile Compatible | Notes |
|---------|-------------------|-------|
| `authService` | ✅ Yes | Uses Firebase Auth SDK, platform-aware |
| `userService` | ✅ Yes | Uses repositories and storage, no UI |
| `notificationService` | ✅ Yes (with caveat) | Creates in-app notifications. Push notifications would need adapter |
| `storageService` | ✅ Yes | Uses Firebase Storage SDK |
| `riskAlertService` | ✅ Yes | Pure business logic, no platform dependencies |
| `appointmentService` | ✅ Yes | Full business logic, works on both platforms |
| `facilitatorStudentLinkService` | ✅ Yes | Read-only, no platform dependencies |
| `messagingService` | ✅ Yes | Real-time listeners work on React Native |
| `workHoursService` | ✅ Yes | Pure business logic |
| `appointmentSlotService` | ✅ Yes | Pure business logic |
| `assessmentTemplateService` | ✅ Yes | Pure business logic |
| `assessmentService` | ✅ Yes | Full assessment flow, risk evaluation |
| `assessmentResponseService` | ✅ Yes | Response management, no platform dependencies |

### Key Observations

1. **All services in `packages/shared-services/src/services/` are mobile-ready**
2. **The `authService` in shared-services is the correct implementation** - the web's `apps/web/src/lib/auth.ts` should be deprecated
3. **No service imports React or browser-specific APIs**
4. **All services use the shared Firebase layer**

---

## Part 7 — UI Separation

### UI Folders That Must Remain Separate

| Folder | Status | Reason |
|--------|--------|--------|
| `apps/web/src/pages/` | ❌ Web-only | React components with Tailwind CSS, HTML structure |
| `apps/web/src/components/ui/` | ❌ Web-only | HTML elements, Tailwind CSS, browser-specific styling |
| `apps/web/src/components/layout/` | ❌ Web-only | Layout components using HTML and Tailwind |
| `apps/web/src/components/assessment/` | ❌ Web-only | Assessment UI components |
| `apps/web/src/components/messaging/` | ❌ Web-only | Messaging UI components |
| `apps/web/src/components/appointments/` | ❌ Web-only | Appointment UI components |
| `apps/web/src/components/notifications/` | ❌ Web-only | Notification UI components |
| `apps/web/src/styles/` | ❌ Web-only | Tailwind CSS, CSS variables |

### Recommended Mobile UI Structure

```
apps/mobile/
├── src/
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   └── ForgotPasswordScreen.tsx
│   │   ├── student/
│   │   │   ├── DashboardScreen.tsx
│   │   │   ├── AssessmentsScreen.tsx
│   │   │   ├── AppointmentsScreen.tsx
│   │   │   ├── MessagesScreen.tsx
│   │   │   └── ProfileScreen.tsx
│   │   └── facilitator/
│   │       ├── DashboardScreen.tsx
│   │       ├── RiskAlertsScreen.tsx
│   │       ├── AppointmentsScreen.tsx
│   │       ├── MessagesScreen.tsx
│   │       ├── WorkHoursScreen.tsx
│   │       └── ProfileScreen.tsx
│   └── components/
│       ├── ui/
│       ├── assessment/
│       ├── messaging/
│       └── appointments/
```

### Shared UI Package

The `packages/shared-ui/` package exists but is empty. It should contain:
- Design tokens (colors, spacing, typography)
- Theme configuration
- **NOT** Tailwind CSS (React Native incompatible)

---

## Part 8 — Firebase Audit

### Authentication

| Component | Status | Notes |
|-----------|--------|-------|
| Firebase Auth SDK | ✅ Shared | Works on both platforms |
| User document structure | ✅ Shared | `users/{uid}` with role, isActive |
| Session management | ✅ Shared | `onAuthStateChanged` works on both |
| Password reset | ✅ Shared | `sendPasswordResetEmail` works on both |

### Firestore

| Component | Status | Notes |
|-----------|--------|-------|
| Security Rules | ✅ Shared | No platform-specific conditions |
| Collection structure | ✅ Shared | All collections defined in `firestore.rules` |
| Indexes | ✅ Shared | `firestore.indexes.json` is platform-agnostic |
| Real-time listeners | ✅ Shared | `onSnapshot` works on React Native |

### Storage

| Component | Status | Notes |
|-----------|--------|-------|
| Firebase Storage SDK | ✅ Shared | Works on both platforms |
| Storage paths | ✅ Shared | Defined in `STORAGE_PATHS` constant |
| File upload | ✅ Shared | `uploadBytes` works on React Native |

### Security Rules Analysis

The `firebase/firestore.rules` are **fully platform-agnostic**:
- Uses `request.auth` for authentication
- Uses `userDoc().data` for role checks
- No platform-specific conditions
- All collections have consistent access patterns

### Indexes Analysis

The `firebase/firestore.indexes.json` is **fully platform-agnostic**:
- All indexes are for Firestore queries
- No platform-specific configurations
- Can be deployed once and used by both platforms

---

## Part 9 — Build System Audit

### Current Build Configuration

| Tool | Web | Mobile |
|------|-----|--------|
| Package Manager | npm workspaces | npm workspaces |
| Build Tool | Vite | Expo (planned) |
| TypeScript | `tsconfig.base.json` | Would need `tsconfig.json` |
| Module Resolution | bundler | Node (Expo default) |

### Recommended Configuration

#### Web (`apps/web/`)
- Keep Vite configuration
- Continue using `VITE_*` environment variables
- Use `react-router-dom` for navigation

#### Mobile (`apps/mobile/`)
- Use Expo with TypeScript template
- Use `EXPO_PUBLIC_*` environment variables
- Use React Navigation for navigation
- Configure `metro.config.js` for monorepo support

#### Shared Packages
- `shared-types`: No changes needed
- `shared-services`: No changes needed
- `shared-ui`: Add design tokens only, no Tailwind

### TypeScript Configuration

The `tsconfig.base.json` is compatible with both platforms. For mobile, add:

```json
{
  "compilerOptions": {
    "jsx": "react-native",
    "strict": true,
    "moduleResolution": "node"
  }
}
```

### Metro Compatibility

For Expo/Metro to work with the monorepo:

```javascript
// apps/mobile/metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('ts', 'tsx');
config.resolver.nodeModulesPaths = [
  '../../node_modules',
  '../../packages/shared-types/node_modules',
  '../../packages/shared-services/node_modules',
];

module.exports = config;
```

---

## Part 10 — Future Folder Structure

### Recommended Final Structure

```
spartan-g/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── pages/           # Web pages (React components)
│   │   │   ├── components/
│   │   │   │   ├── ui/          # Web UI components
│   │   │   │   ├── layout/      # Web layout components
│   │   │   │   └── ...          # Feature components
│   │   │   ├── navigation/      # React Router
│   │   │   ├── hooks/         # Web-specific hooks
│   │   │   └── styles/        # Tailwind CSS
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   └── mobile/
│       ├── src/
│       │   ├── screens/         # React Native screens
│       │   ├── components/
│       │   │   └── ui/          # React Native UI components
│       │   ├── navigation/      # React Navigation
│       │   ├── hooks/         # Mobile-specific hooks
│       │   └── adapters/      # Platform adapters (FCM, etc.)
│       ├── app.config.js
│       ├── package.json
│       └── metro.config.js
│
├── packages/
│   ├── shared-types/
│   │   ├── src/
│   │   │   ├── types/           # All TypeScript interfaces
│   │   │   ├── constants/       # Roles, permissions, collections
│   │   │   └── utils/           # Pure utility functions
│   │   └── package.json
│   │
│   ├── shared-services/
│   │   ├── src/
│   │   │   ├── firebase/        # Firebase SDK wrappers
│   │   │   ├── repositories/    # Firestore data access
│   │   │   ├── services/        # Business logic
│   │   │   ├── store/          # Zustand stores
│   │   │   └── config/         # Environment configuration
│   │   └── package.json
│   │
│   └── shared-ui/
│       ├── src/
│       │   └── tokens.ts        # Design tokens only
│       └── package.json
│
├── firebase/
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   └── storage.rules
│
└── package.json                 # npm workspaces root
```

### Shared UI Package Recommendation

**Recommendation: Keep `shared-ui` minimal with design tokens only.**

**Reasoning:**
- React Native and Web have fundamentally different styling systems
- Tailwind CSS is not compatible with React Native
- Sharing UI components would require a cross-platform library (e.g., `react-native-web`)
- The effort to create cross-platform UI components outweighs the benefits
- Design tokens (colors, spacing, typography) can be shared as constants

---

## Part 11 — Risks

### Risk Matrix

| Risk | Description | Severity | Mitigation |
|------|-------------|----------|------------|
| **Duplicate Authentication** | `apps/web/src/lib/auth.ts` duplicates `authService` in shared-services | Critical | Remove `apps/web/src/lib/auth.ts` and use `authService` from shared-services |
| **Web Auth Hook Dependency** | `useAuth.tsx` hook uses web-specific `import.meta.env` and React Context | High | Create mobile-specific auth hook using Zustand store |
| **UI Component Duplication** | No shared UI means reimplementing components | Medium | Accept as necessary - different platforms require different implementations |
| **Environment Variable Mismatch** | Web uses `VITE_*`, mobile uses `EXPO_PUBLIC_*` | Low | Already handled in `shared-services/src/config/env.ts` |
| **Navigation Incompatibility** | React Router vs React Navigation | High | Create separate navigation layers per platform |
| **State Management Split** | Web uses React Context, shared uses Zustand | Medium | Migrate web to use Zustand store from shared-services |
| **Storage API Differences** | Web has localStorage, mobile has AsyncStorage | Low | No direct usage found - no action needed |
| **Push Notification Gap** | Mobile needs FCM, web uses in-app notifications | Medium | Create notification adapter pattern |
| **Deep Linking** | Password reset needs deep linking on mobile | Low | Implement with Expo Linking API |
| **Offline Support** | Mobile needs offline persistence | Low | Enable Firestore offline persistence in mobile |

### Critical Risks (Must Address Before Mobile Development)

1. **Remove duplicate authentication in `apps/web/src/lib/auth.ts`**
   - This file duplicates `authService` functionality
   - Mobile should use `authService` from shared-services
   - Web should migrate to use `authService` as well

2. **Migrate web auth hook to use Zustand store**
   - `apps/web/src/hooks/useAuth.tsx` should use `useAuthStore` from shared-services
   - This ensures both platforms use the same state management

---

## Part 12 — Migration Plan

### Phased Roadmap

#### Phase 1: Authentication Cleanup
- [ ] Remove `apps/web/src/lib/auth.ts` (duplicate)
- [ ] Update `apps/web/src/hooks/useAuth.tsx` to use `useAuthStore` from shared-services
- [ ] Verify web app still works with shared-services auth

#### Phase 2: Architecture Validation
- [ ] Audit all web files for platform-specific dependencies
- [ ] Create list of mobile-specific abstractions needed
- [ ] Document all service method signatures for mobile use

#### Phase 3: Mobile Project Setup
- [ ] Create `apps/mobile/package.json` with Expo dependencies
- [ ] Create `apps/mobile/metro.config.js` for monorepo support
- [ ] Create `apps/mobile/tsconfig.json` extending base
- [ ] Create `apps/mobile/app.config.js` for environment variables

#### Phase 4: Mobile Firebase Configuration
- [ ] Configure Firebase for Expo (use `shared-services/firebase/`)
- [ ] Set up `EXPO_PUBLIC_*` environment variables
- [ ] Test Firebase connection on mobile

#### Phase 5: Mobile Authentication
- [ ] Create `apps/mobile/src/hooks/useAuth.ts` using `useAuthStore`
- [ ] Create auth screens (Login, Register, ForgotPassword)
- [ ] Implement platform context setting

#### Phase 6: Mobile Navigation
- [ ] Install React Navigation
- [ ] Create `RootNavigator` with role-based routing
- [ ] Create `AuthNavigator` for auth flow
- [ ] Create `StudentNavigator` (tabs)
- [ ] Create `FacilitatorNavigator` (tabs)

#### Phase 7: Mobile Student Screens
- [ ] Create `DashboardScreen`
- [ ] Create `AssessmentsScreen`
- [ ] Create `AppointmentsScreen`
- [ ] Create `MessagesScreen`
- [ ] Create `ProfileScreen`

#### Phase 8: Mobile Facilitator Screens
- [ ] Create `DashboardScreen`
- [ ] Create `RiskAlertsScreen`
- [ ] Create `AppointmentsScreen`
- [ ] Create `MessagesScreen`
- [ ] Create `WorkHoursScreen`
- [ ] Create `ProfileScreen`

#### Phase 9: Mobile Features
- [ ] Implement push notifications (FCM)
- [ ] Implement offline support
- [ ] Implement deep linking for password reset

#### Phase 10: Testing
- [ ] Test shared services on mobile
- [ ] Test authentication flow
- [ ] Test real-time features
- [ ] Test offline behavior

---

## Part 13 — Final Recommendation

### Is the Current Architecture Ready for a Mobile App?

**✅ YES, with minor adjustments.**

The architecture is well-designed for mobile integration:
- Shared services are platform-agnostic
- Firebase layer is properly abstracted
- Types and constants are reusable
- Environment configuration supports both platforms

### What Must Be Completed Before Starting Mobile Development?

1. **Remove duplicate authentication code** (`apps/web/src/lib/auth.ts`)
2. **Migrate web to use shared-services auth** (use `authService` and `useAuthStore`)
3. **Set up Expo project structure** in `apps/mobile/`
4. **Configure environment variables** for Expo (`EXPO_PUBLIC_*`)

### What Should NEVER Be Duplicated?

| Component | Reason |
|-----------|--------|
| Firebase initialization | Single source of truth for Firebase config |
| Repository pattern | Data access logic should be shared |
| Business services | All business logic in `shared-services` |
| Types and interfaces | Single source of truth for data models |
| Security rules | Same rules for both platforms |
| Risk evaluation logic | Pure functions, shared by both |
| Permission system | RBAC should be consistent |

### What Should ONLY Exist Once in the Repository?

| Component | Location |
|-----------|----------|
| Firebase config | `packages/shared-services/src/config/env.ts` |
| Auth service | `packages/shared-services/src/services/auth.service.ts` |
| All repositories | `packages/shared-services/src/repositories/` |
| All services | `packages/shared-services/src/services/` |
| All types | `packages/shared-types/src/` |
| Security rules | `firebase/firestore.rules` |
| Firestore indexes | `firebase/firestore.indexes.json` |
| Zustand store | `packages/shared-services/src/store/` |

### Is a React Native App Feasible Without Affecting the Web Application?

**✅ YES, absolutely.**

The shared-services package is already designed to be platform-agnostic:
- No React imports
- No browser-specific APIs
- Environment variables are abstracted
- Firebase SDK works on both platforms

The web application would only be affected positively:
- Cleaner architecture (removing duplicate auth code)
- Shared state management (Zustand)
- Consistent business logic

### Summary

The SPARTAN-G architecture is **mobile-ready** with the following key strengths:

1. **Shared Firebase layer** - Works on both platforms
2. **Platform-agnostic services** - No web-specific code
3. **Environment abstraction** - Supports both Expo and Vite
4. **Zustand for state** - Works on React Native
5. **Clean separation** - UI is already separate from business logic

The main work required is:
1. Clean up duplicate authentication code in web
2. Set up the Expo project structure
3. Create mobile-specific UI and navigation layers
4. Implement platform adapters (FCM, etc.)
</tool_call>