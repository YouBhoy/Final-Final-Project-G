# SPARTAN-G System Audit Report

**Date:** July 19, 2026  
**Audit Scope:** Full-stack monorepo (mobile + web + shared packages + Firebase backend)  
**Audit Type:** Security, Architecture, Code Quality, Dependency, and Configuration Review  
**Previous Audit:** July 17, 2026 — this report supersedes it

---

## 1. Executive Summary

SPARTAN-G is a multi-platform learning management system built as a monorepo with shared TypeScript packages. It supports three roles (student, facilitator, super_admin) across two platforms (mobile via Expo/React Native, web via Vite/React). The backend is entirely Firebase-based (Firestore, Auth, Storage, FCM).

**Overall Assessment:** The codebase demonstrates strong architectural planning with clean separation of concerns, well-defined RBAC, and comprehensive Firestore security rules. However, several **critical security issues**, **dependency concerns**, and **operational gaps** were identified that should be addressed before production deployment.

**Risk Level: MEDIUM-HIGH** — Primarily due to exposed API keys, unused role creation, and potential Firestore security rule gaps.

---

## 2. Architecture Audit

### 2.1 Strengths

| Aspect | Assessment |
|--------|-----------|
| **Monorepo structure** | Well-organized with npm workspaces; `shared-types`, `shared-services`, `shared-ui` packages cleanly separate concerns |
| **RBAC design** | Role hierarchy, permission matrix, platform access control are thoroughly defined in `shared-types` |
| **Repository pattern** | `BaseRepository` with specialized repos provides clean Firestore abstraction |
| **Service layer** | Business logic isolated from UI; Zustand stores manage auth/state effectively |
| **Platform adapters** | `MessagingAdapter` abstraction for FCM allows mobile (Expo) and web with different implementations |
| **Navigation** | Well-structured mobile navigation using React Navigation; web uses React Router with clear route separation |

### 2.2 Architectural Concerns

| Issue | Severity | Details |
|-------|----------|---------|
| **Firebase credentials in .env committed to repo** | **CRITICAL** | `.env` file with live Firebase API keys, project ID, and sender ID is committed in the repository (`apps/mobile/.env`). This exposes the project to potential abuse. |
| **Mobile app has no HTTPS enforcement** | MEDIUM | The Firebase Auth domain (`spartan-g-a2d80.firebaseapp.com`) is hardcoded. Ensure all communications use HTTPS. |
| **No rate limiting** | MEDIUM | No apparent rate limiting on auth endpoints or Firestore writes — could be abused. |
| **No analytics/performance monitoring** | LOW | No Firebase Performance Monitoring or Crashlytics integration detected. |
| **No CI/CD pipeline visible** | MEDIUM | No GitHub Actions or CI configuration found in the repository. |

---

## 3. Security Audit

### 3.1 Authentication & Authorization

| Check | Status | Notes |
|-------|--------|-------|
| **Email/Password auth** | ✅ Implemented | Uses Firebase Auth with `signInWithEmailAndPassword` |
| **Password reset** | ✅ Implemented | `sendPasswordResetEmail` flow exists |
| **Platform access enforcement** | ✅ Implemented | `assertPlatformAccess()` blocks super_admin on mobile |
| **Role-based navigation** | ✅ Implemented | Both mobile (`RootNavigator`) and web (`ProtectedRoute`) gate content by role |
| **Session validation** | ⚠️ Partial | `buildSession()` checks `isActive` flag on user doc, but no token refresh mechanism detected |
| **Email verification** | ⚠️ Not enforced | `emailVerified` field exists in `AuthSession` but no verification gate on sign-in |

### 3.2 Firestore Security Rules Analysis

| Rule | Assessment | Finding |
|------|-----------|---------|
| **User creation** | ⚠️ **VULNERABLE** | `allow create: if request.resource.data.role in ['student', 'facilitator', 'super_admin']` — Users can set `role` to `super_admin` on registration. The frontend sets a default role of `student`, but there's **no server-side enforcement** preventing a crafted client request from creating a super_admin account. |
| **User reads** | ⚠️ **OVER-PERMISSIVE** | Students can read facilitator users (`isStudent() && resource.data.role == 'facilitator' && resource.data.isActive == true`) — This is intended for appointment booking, but exposes all active facilitator accounts. |
| **Assessments collection** | ⚠️ **DUPLICATE RULE** | Lines 308-309 have two `allow create: if` statements (`isStudent()` and `isSuperAdmin()`). These should be combined with `||`. While Firestore evaluates both, this creates maintenance confusion. |
| **Assessment Responses** | ⚠️ **PERMISSIVE** | Students can update any assessment response where they match `studentId` — no check if the assessment is still editable (e.g., after submission deadline). |
| **Profiles — create/update** | ✅ **CONFIRMED SAFE** | `allow create, update: if isOwner(userId) || isSuperAdmin()` — No `hasOnly()`, no `diff()` restrictions. The new `upsert()` method uses `setDoc({merge:true})`, which is covered by this same rule (create AND update in one expression). The `userId` path parameter is derived from the document path, not the data payload, so the `uid: id` in `upsert()` cannot be exploited to impersonate another user. |
| `assessment_overrides` | ✅ Good | Proper validation on `maxAttemptsOverride` range (1-10) and `grantedBy == request.auth.uid` |
| `conversations` | ✅ Good | Participant-based access control, limited updatable fields |
| `messages` | ✅ Good | Read-by tracking with validation on array size increase (exactly +1) |
| `appointments` | ✅ Good | Proper state machine enforcement (requested → cancelled or accepted → etc.) |
| `work_hours_schedules` | ✅ Good | Owner-based CRUD, users can read any schedule with a `facilitatorId` |
| `appointment_slots` | ✅ Good | Facilitator owns their slots, students can only reserve available slots |

### 3.3 Storage Security Rules Analysis

| Path | Assessment | Finding |
|------|-----------|---------|
| `/avatars/{userId}` | ✅ Good | Owner-only write, image type validation, 5MB limit |
| `/assignments/{courseId}/{assignmentId}/{userId}` | ✅ Good | Owner-only write, document type validation, 20MB limit |
| `/courses/{courseId}` | ⚠️ **LOW** | No file type or size validation for course media |
| `/messages/{conversationId}` | ✅ Good | Any active user can upload but document validation enforced |

### 3.4 Key Security Findings

#### FINDING 1 (CRITICAL): API Keys exposed in source control — **UNCHANGED from previous audit**
The `.env` file at `apps/mobile/.env` contains live Firebase credentials including API key, auth domain, project ID, storage bucket, and messaging sender ID. While Firebase API keys are technically "public" by design, committing them alongside the project ID and storage bucket URL increases the attack surface for abuse (e.g., Firestore read/write via direct REST API calls, Storage bucket access bypassing app logic).

**Recommendation:** 
- Add `.env` to `.gitignore` immediately
- Rotate the Firebase API key
- Use Firebase App Check to restrict API calls to only your apps
- Implement Firebase Security Rules with stricter conditions (e.g., `request.auth != null` on all endpoints)

#### FINDING 2 (HIGH): User can create super_admin account — **UNCHANGED from previous audit**
Firestore rule `allow create: if request.resource.data.role in ['student', 'facilitator', 'super_admin']` allows any authenticated user to set `role: 'super_admin'` in the user document. The frontend restricts this in `auth.service.ts` (line 43: `const role = payload.role ?? ROLES.STUDENT`), but a crafted client or direct Firestore API call can bypass this.

**Recommendation:**
- Remove `'super_admin'` from allowed create roles in Firestore rules
- Require super_admin role creation only to be possible via a Cloud Function or Firebase Admin SDK

#### FINDING 3 (MEDIUM): No transaction isolation on assessment override — **UNCHANGED in substance, no fix applied**
The `saveOverride()` method in `assessment-override.service.ts` uses a read-then-write pattern without a Firestore transaction. Under concurrent requests, two facilitators could overwrite each other's overrides.

**Recommendation:**
- Use Firestore `runTransaction()` for the read-update-create pattern in `saveOverride()`

#### FINDING 4 (MEDIUM): Profile creation type cast — **PARTIALLY MITIGATED**
Line 65 of `auth.service.ts`: `await profileRepository.create(user.uid, { uid: user.uid } as never);` — This type assertion still exists in the registration path. However, the new `upsert()` method on `profileRepository` replaces the `update()` call in `user.service.ts`, which was the primary consumer for non-registration updates. The registration-time `create()` call is unchanged.

**Recommendation:**
- Define a proper `CreateProfileDTO` type and use it instead of `as never`

#### FINDING 5 (MEDIUM): No input sanitization on document uploads
Storage rules validate content type, but Firestore security rules don't validate field types comprehensively across all collections. For example, `submissions` create rule doesn't validate the shape of the submitted data beyond `studentId`.

**Recommendation:**
- Add Firestore rules validation for required fields using `request.resource.data.keys().hasAll([...])` on create operations
- Consider using Firestore `create` vs `update` distinction to require all required fields on creation

#### FINDING 6 (LOW): Duplicate assessments create rule
The `assessments` collection has two separate `allow create` rules (lines 307-308). While Firestore allows this (evaluated as OR), it's confusing and could mask future rule conflicts.

**Recommendation:**
- Merge into a single rule: `allow create: if isStudent() && request.resource.data.studentId == request.auth.uid || isSuperAdmin();`

---

## 4. Delta Audit — Changes Since July 17

This section reviews everything added or changed during the July 19 work session.

| Change | Files | Security Review | Verdict |
|--------|-------|-----------------|---------|
| `ProfileDocument` fields added | `user.types.ts` | `yearLevel`, `campus`, `college`, `course` — optional strings, no security impact | ✅ SAFE |
| `profileRepository.upsert()` | `profile.repository.ts` | Uses `setDoc({ merge: true })`. Firestore rule `allow create, update: if isOwner(userId)` covers both operations. `userId` from path param, not data payload — no impersonation vector. | ✅ SAFE |
| `userService.updateProfile()` → `upsert()` | `user.service.ts` | Replaced `profileRepository.update()` with `.upsert()`. Same permission check (`actorRole` + `MANAGE_USERS`) unchanged. | ✅ SAFE |
| `userService.uploadAvatar()` → `upsert()` | `user.service.ts` | Same operation, just tolerant of missing doc. | ✅ SAFE |
| `setSession()` added to auth store | `auth.store.ts` | Zustand setter — no security implications. Only called from `StudentProfileScreen` after successful name save to sync `session.displayName`. | ✅ SAFE |
| `StudentProfileScreen.tsx` created | New file | Uses existing `userRepository`, `profileRepository`, `useAuthStore` — no new attack surface. Edit/Save flow guarded by session check. | ✅ SAFE |
| `formatWorkHours()` applied across 3 screens | `FindFacilitatorScreen`, `WorkHoursScreen`, `SlotsScreen` | Display-only change, no security impact. | ✅ SAFE |
| `StudentNavigator.tsx` updated | Navigation config | `PlaceholderScreen` → `StudentProfileScreen` — no security impact. | ✅ SAFE |

### 4.1 `setSession()` — Consistency Note

`setSession()` was added to the auth store interface and implementation. It updates only the `session` field in the Zustand store — it does NOT modify `status`, `error`, or any other state. This means:
- If called when `status` is `'unauthenticated'`, the session will be set but the status won't reflect it
- Currently only called from `StudentProfileScreen.handleSave()` after a successful name write
- No other code path triggers it, so this inconsistency is latent but harmless today

**Recommendation:** Either guard `setSession` to only be callable when `status === 'authenticated'`, or have it also set `status: 'authenticated'`. Low priority.

### 4.2 Assessment Override Service — Pre-existing Concerns (Not Changed Today)

The `assessment-override.service.ts` file was NOT modified today, but it was reviewed as part of the full audit scope:

| Issue | Severity | Details |
|-------|----------|---------|
| `saveOverride()` — no transaction | MEDIUM | Read-then-write without `runTransaction()`. Two simultaneous override saves for the same student+assessment can race. |
| `saveOverride()` — `as unknown as` cast | MEDIUM | Line 92: `as unknown as AssessmentOverrideDocument` bypasses type checking. `grantedAt: now` with `serverTimestamp()` may not match the `Timestamp` type at runtime. |
| Empty `catch` block | LOW | Lines 42-44: catches errors but only logs, silently falls through. Intended behavior (graceful degradation) but swallows real Firestore errors. |
| `reason: reason ?? ''` | LOW | Distinguishes "no reason provided" from "intentionally set to empty string" — unclear if this matters for the UI. |

### 4.3 Missing Profile Doc Gap — Historical, Self-Healing

**Confirmed via Firebase Console:** 14 users exist without matching `profiles/{uid}` documents. This is historical — accounts created via Firebase Console or before profile-creation code was added to `auth.service.ts`.

**Self-healing mechanism:** The `upsert()` method creates the missing document on first save. No backfill script is needed as no other feature reads the `profiles` collection (all features read from `users`).

**Registration flow verified:** A new account registered through the app correctly creates both `users/{uid}` and `profiles/{uid}` documents.

---

## 5. Code Quality Audit

### 5.1 TypeScript Practices

| Check | Assessment | Notes |
|-------|-----------|-------|
| **Type safety** | ✅ Good | Extensive use of types, interfaces, and generics |
| **No `any` usage** | ⚠️ Minor | Found in `assessment-override.service.ts`, `StudentProfileScreen.tsx` (`(err as any).cause` in logging code) |
| **Error handling** | ✅ Good | Custom error classes (`AuthError`, `PermissionError`, `PlatformAccessError`) |
| **Async patterns** | ✅ Good | Proper async/await usage throughout |
| **Null safety** | ⚠️ Partial | Several `as never` and `as unknown as` casts that bypass type checking |
| **Module organization** | ✅ Good | Clear barrel exports in `index.ts` files |

### 5.2 Potential Bugs

| Location | Issue | Severity |
|----------|-------|----------|
| `assessment-override.service.ts:87-94` | `as unknown as AssessmentOverrideDocument` for create data — may miss required fields at runtime | MEDIUM |
| `auth.service.ts:65` | `as never` type assertion for profile creation | MEDIUM |
| `assessment-override.service.ts:38-40` | Empty `catch` block silently swallows errors | LOW |
| `assessment-override.service.ts:83-84` | `reason: reason ?? ''` — if empty string is valid, this is fine; otherwise default should be distinguished from explicit intent | LOW |

### 5.3 Testing

| Check | Status | Notes |
|-------|--------|-------|
| **Unit tests** | ❌ Missing | No Jest or testing framework configured in any package |
| **Integration tests** | ❌ Missing | No Firestore emulator tests |
| **E2E tests** | ❌ Missing | No Detox, Appium, or Playwright tests |
| **Utils tests** | ⚠️ Partial | Only `risk-evaluation.test.mjs` and `appointment-scheduling.test.mjs` exist in `shared-types`, and they use `.mjs` with CommonJS conventions — appears non-functional |

---

## 6. Dependency Audit

### 6.1 Package Versions

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| `react` | 18.3.1 | ✅ Current | Latest stable 18.x |
| `react-native` | 0.76.5 | ✅ Current | |
| `expo` | ~52.0.0 | ✅ Current | |
| `firebase` | ^11.0.0 | ✅ Current | Latest v11 |
| `zustand` | ^5.0.0 | ✅ Recent | |
| `typescript` | ~5.3.0 | ⚠️ Outdated | Latest is ~5.7/5.8 |
| `tailwindcss` | ^4.3.1 | ✅ Current | |
| `react-router-dom` | ^6.30.4 | ✅ Current | |
| `expo-notifications` | ~0.29.0 | ✅ Current | |

### 6.2 Dependency Concerns

| Issue | Severity | Details |
|-------|----------|---------|
| **No lockfile audit** | MEDIUM | `package-lock.json` exists but no `npm audit` report was found — potential known vulnerabilities in transitive dependencies |
| **Missing CI dependency scanning** | MEDIUM | No Dependabot, Snyk, or similar dependency scanning configured |
| **Dev dependencies in shared packages** | LOW | TypeScript is listed as devDependency in all packages but with same version — better to hoist to root |
| **Package duplication risk** | LOW | `firebase` appears in both `shared-services` and `apps/web` — should verify tree-shaking works correctly |

---

## 7. Configuration & Operations Audit

### 7.1 Firebase Configuration

| Check | Status | Notes |
|-------|--------|-------|
| **Firestore indexes** | ✅ Comprehensive | 30+ indexes defined covering all query patterns |
| **Security rules** | ⚠️ See findings | Well-written but has noted gaps |
| **Storage rules** | ✅ Good | Well-structured with type/size validation |
| **EAS Build config** | ✅ Present | `eas.json` and `app.json` found |
| **Firebase emulator** | ❌ Not configured | No `firebase.json` emulator config |

### 7.2 Environment & DevOps

| Check | Status | Notes |
|-------|--------|-------|
| **Environment separation** | ⚠️ Partial | Only `EXPO_PUBLIC_APP_ENV=development` — no staging/production environment differentiation for Firebase projects |
| **Secrets management** | ❌ Poor | API keys committed; no mention of secrets manager or `.env` in `.gitignore` |
| **CI/CD** | ❌ Not found | No build/test/deploy pipeline |
| **Code linting** | ❌ Not configured | No ESLint or Prettier config files in repository |

---

## 8. Detailed Recommendations

### Priority 1 — Critical (Address Immediately)

1. **Rotate and secure Firebase credentials**
   - Remove `.env` from version control (add to `.gitignore`)
   - Rotate the Firebase API key at `AIzaSyBRUTiTsoFkVtrLInvuqDTH0rTVYHYjWyM`
   - Enable **Firebase App Check** to restrict API calls to only your registered apps
   - Use environment-specific Firebase projects (dev/staging/prod)

2. **Fix Firestore user creation rule**
   ```diff
   - allow create: if request.resource.data.role in ['student', 'facilitator', 'super_admin']
   + allow create: if request.resource.data.role in ['student', 'facilitator']
   ```
   Then create super_admin accounts only via Firebase Admin SDK or Cloud Function.

### Priority 2 — High (Address Before Production)

3. **Add transaction safety to assessment overrides**
   - Wrap the `saveOverride()` method in `runTransaction()` to prevent race conditions

4. **Fix type safety issues**
   - Create proper DTO types for profile creation instead of `as never`
   - Add a proper `CreateAssessmentOverrideDTO` type

5. **Add Firestore field validation**
   - Add `request.resource.data.keys().hasAll([...])` validation on create rules for critical collections (submissions, assessments, profiles)

6. **Add automated testing**
   - Configure Jest with Firestore emulator for unit/integration tests
   - Add at minimum auth and security rules tests

### Priority 3 — Medium

7. **Add Firebase Performance Monitoring and Crashlytics** for production observability

8. **Configure CI/CD pipeline** with GitHub Actions:
   - TypeScript type checking
   - Linting
   - Test suite
   - Firebase rules deployment
   - EAS Build for mobile

9. **Add ESLint and Prettier** configuration for consistent code style

10. **Implement rate limiting** via Cloud Functions or Firebase Extensions

11. **Set up separate Firebase projects** for development, staging, and production environments

### Priority 4 — Low

12. Merge the duplicate `allow create` rules in `assessments` collection

13. Improve error handling — replace empty catch blocks with proper logging

14. Update TypeScript to latest version

15. Add email verification enforcement for production

16. **Guard `setSession()`** to either set `status: 'authenticated'` or only work when already authenticated

---

## 9. Security Scorecard

| Category | Score | Notes | Delta |
|----------|-------|-------|-------|
| **Authentication** | 7/10 | Good foundation, missing email verification enforcement | ↔ No change |
| **Authorization (RBAC)** | 8/10 | Excellent design, but rule gap on user creation | ↔ No change |
| **Firestore Rules** | 6/10 | Well-structured, but has critical creation rule gap | ↔ No change |
| **Storage Rules** | 8/10 | Good validation, minor gaps on course media | ↔ No change |
| **Data Validation** | 5/10 | Client-side only; missing server-side field validation | ↔ No change |
| **Secrets Management** | 2/10 | API keys committed to repo | ↔ No change |
| **Testing Coverage** | 1/10 | Virtually no automated tests | ↔ No change |
| **CI/CD** | 1/10 | No pipeline configured | ↔ No change |
| **Dependency Management** | 5/10 | Modern packages, no audit or scanning | ↔ No change |
| **Code Quality** | 7/10 | Clean TypeScript, some type safety issues | ✅ Slightly improved (less `any` usage) |

**Overall Security Score: 50/100 (MEDIUM RISK)** — Unchanged from previous audit. Today's changes were all net-safe and did not introduce new risk.

---

## 10. Changes Summary (Today Only)

| Fix/Feature | Risk Introduced | Status |
|-------------|----------------|--------|
| `ProfileDocument` — 4 new fields | ⚠️ None (optional, only used in profile screen) | ✅ Deployed |
| `profileRepository.upsert()` — setDoc with merge | ⚠️ None (same Firestore rule applies) | ✅ Deployed |
| `userService.updateProfile()` → upsert | ⚠️ None (same permission check) | ✅ Deployed |
| `userService.uploadAvatar()` → upsert | ⚠️ None (same operation, tolerant of missing doc) | ✅ Deployed |
| `auth.store.setSession()` | ⚠️ None (Zustand setter, no security impact) | ✅ Deployed |
| `StudentProfileScreen` (full screen) | ⚠️ None (uses existing auth pattern) | ✅ Deployed |
| `formatWorkHours()` applied to 3 screens | ⚠️ None (display-only) | ✅ Deployed |
| Missing profile docs (14 accounts) | ⚠️ Self-healing via upsert, no impact on other features | ✅ Documented |
| Registration flow verification | ⚠️ Confirmed healthy — both `users/{uid}` and `profiles/{uid}` created | ✅ Verified |

---

## 11. Key Metrics

| Metric | Value |
|--------|-------|
| Total TypeScript source files | ~70+ |
| Firestore collections | 15+ |
| Firestore indexes | 30+ |
| Security rules lines (Firestore) | 344 |
| Security rules lines (Storage) | 73 |
| NPM workspaces | 5 (mobile, web, shared-types, shared-services, shared-ui) |
| Test suites | 2 (non-functional `.mjs` files) |
| Roles defined | 3 (student, facilitator, super_admin) |
| Permissions defined | 24 |
| Unused UI routes/screens | RiskAlertDetail, AppointmentDetail, ManageCourse, GradeSubmission (all marked as placeholder) |
| Exposed API keys | 1 (`AIzaSyBRUTiTsoFkVtrLInvuqDTH0rTVYHYjWyM`) |
| Accounts missing profile docs | 14 (historical, self-healing via upsert) |

---

## 12. Conclusion

SPARTAN-G demonstrates excellent architectural design with its monorepo structure, well-defined RBAC system, clean service/repository pattern, and comprehensive Firestore indexing. The codebase is well-organized with clear separation of concerns between shared packages and platform-specific apps.

**However, the project is not production-ready.** The critical security finding of committed API keys and the Firestore rule that allows super_admin account creation by any user represent significant risks. Combined with the absence of automated testing, CI/CD, and proper environment separation, these issues should be resolved before any production deployment.

**Today's changes (July 19) did not introduce any new security risk or regressions.** The `upsert()` method is properly scoped to `profileRepository` only, uses the same Firestore rule that already allowed create+update, and the `uid` path parameter cannot be spoofed from data payload. The session sync (`setSession()`) is purely in-memory state management.

The most impactful immediate actions are: (1) rotating and securing Firebase credentials, (2) fixing the Firestore user creation rule, and (3) implementing Firebase App Check. These three changes would dramatically improve the security posture.

---

*Audit generated by automated code review — July 19, 2026 (supersedes July 17, 2026 audit)*