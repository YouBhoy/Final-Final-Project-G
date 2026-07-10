# Authentication Migration Plan: Custom Firestore to Firebase Authentication

## Executive Summary

This document outlines the migration from a custom Firestore-only authentication system to Firebase Authentication (Email/Password). The current implementation stores user credentials in Firestore without Firebase Auth integration, causing Firestore security rules to fail with "Missing or insufficient permissions" errors because `request.auth.uid` is never populated.

---

## 1. Current Authentication Flow

### 1.1 Architecture Overview

The current authentication system is a **custom, Firestore-only implementation** that does not integrate with Firebase Authentication.

```
┌─────────────────┐
│   Login Page    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  loginUser()    │  (apps/web/src/lib/auth.ts)
│  - Query users  │  - Find user by email in Firestore
│    collection   │  - No password verification (placeholder)
│  - Store session│  - Store session in localStorage
│    in localStorage│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  useAuth Hook   │  (apps/web/src/hooks/useAuth.tsx)
│  - onAuthChange │  - Reads from localStorage
│    reads from   │  - No Firebase Auth listener
│    localStorage │
└─────────────────┘
```

### 1.2 Key Files - Current Implementation

| File | Purpose |
|------|---------|
| `apps/web/src/lib/auth.ts` | Core auth functions (registerUser, loginUser, logoutUser, onAuthChange) |
| `apps/web/src/hooks/useAuth.tsx` | React context provider and hook for auth state |
| `apps/web/src/types/auth.types.ts` | Local auth types (duplicate of shared-types) |
| `apps/web/src/pages/LoginPage.tsx` | Login UI |
| `apps/web/src/pages/RegisterPage.tsx` | Registration UI |
| `apps/web/src/pages/ForgotPasswordPage.tsx` | Password reset UI (non-functional) |
| `apps/web/src/components/auth/ProtectedRoute.tsx` | Route protection component |
| `apps/web/src/navigation/AppRouter.tsx` | Router with AuthProvider wrapper |

### 1.3 Current Authentication Issues

1. **No Firebase Auth Integration**: Users are never authenticated through Firebase Auth
2. **Custom Session Management**: Uses `localStorage.setItem("auth_user", ...)` instead of Firebase's built-in session management
3. **No Password Verification**: The `loginUser` function only checks if a user document exists, with no actual password verification
4. **Custom UID Generation**: Uses `user_${Date.now()}` instead of Firebase's auto-generated UIDs
5. **Security Rules Fail**: Firestore rules using `request.auth.uid` always fail because `request.auth` is null

### 1.4 Current User Document Structure

```typescript
// users/{uid} - Current structure
{
  uid: string;           // Custom generated: "user_1234567890"
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 2. Target Authentication Flow

### 2.1 Architecture Overview

The target authentication system uses **Firebase Authentication** as the single source of truth for authentication, with Firestore storing only user profile data.

```
┌─────────────────┐
│   Login Page    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  signInWithEmail│  (Firebase Auth SDK)
│  andPassword()  │  - Authenticates with Firebase
│                 │  - Returns Firebase User with UID
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  onAuthStateChanged│  (Firebase Auth)
│  - Firebase     │  - Listens for auth state changes
│    listener     │  - Provides real Firebase UID
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  buildSession() │  (shared-services)
│  - Get user     │  - Fetch Firestore user profile
│    profile from │  - Merge with Firebase user data
│    Firestore    │  - Return AuthSession with role
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  useAuth Hook   │  (Updated)
│  - Uses Firebase│  - Subscribes to Firebase Auth state
│    Auth state   │  - No localStorage session
└─────────────────┘
```

### 2.2 Target Authentication Flow - Registration

```
┌─────────────────┐
│  Register Page  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  createUserWith │  (Firebase Auth SDK)
│  EmailAndPassword│ - Creates Firebase Auth user
│                 │ - Returns Firebase UID
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create Firestore│ - Create user document
│  user profile   │ - Use Firebase UID as document ID
│  (users/{uid})  │ - Store profile data only
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Auto sign-in   │  - Firebase Auth session established
│  & redirect     │  - Redirect to role-based dashboard
└─────────────────┘
```

### 2.3 Target User Document Structure

```typescript
// users/{uid} - Target structure (uid = Firebase Auth UID)
{
  uid: string;           // Firebase Auth UID
  email: string;
  displayName: string;     // Full name
  role: Role;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 3. Files That Will Change

### 3.1 Core Authentication Files (MUST CHANGE)

| File | Changes Required |
|------|-----------------|
| `apps/web/src/lib/auth.ts` | **Complete rewrite** - Replace custom auth with Firebase Auth SDK calls |
| `apps/web/src/hooks/useAuth.tsx` | **Update** - Use `onAuthStateChanged` instead of localStorage |
| `apps/web/src/types/auth.types.ts` | **Remove or align** - Types should come from shared-types |

### 3.2 UI Files (Minor Changes)

| File | Changes Required |
|------|-----------------|
| `apps/web/src/pages/LoginPage.tsx` | **Update** - Use Firebase Auth error handling |
| `apps/web/src/pages/RegisterPage.tsx` | **Update** - Handle Firebase Auth registration flow |
| `apps/web/src/pages/ForgotPasswordPage.tsx` | **Update** - Use `sendPasswordResetEmail` from Firebase |

### 3.3 Shared Services Files (Already Partially Implemented)

| File | Changes Required |
|------|-----------------|
| `packages/shared-services/src/services/auth.service.ts` | **Verify** - Already uses Firebase Auth, may need minor updates |
| `packages/shared-services/src/firebase/auth.ts` | **No changes** - Already exports Firebase Auth functions |
| `packages/shared-services/src/firebase/app.ts` | **No changes** - Already initializes Firebase |

### 3.4 Repository Files (No Changes Required)

| File | Notes |
|------|-------|
| `packages/shared-services/src/repositories/user.repository.ts` | Works with Firestore, no changes needed |
| `packages/shared-services/src/repositories/profile.repository.ts` | Works with Firestore, no changes needed |

---

## 4. Services That Will Be Affected

### 4.1 Services Using Authentication

All services in `packages/shared-services/src/services/` receive `actorRole` and `userId` as parameters. These services will continue to work because:

1. **Firestore Security Rules** will now have valid `request.auth.uid`
2. **Services** already pass user IDs to repositories
3. **No code changes required** in service layer

| Service | Impact |
|---------|--------|
| `appointment.service.ts` | No changes - will work with Firebase Auth UIDs |
| `assessment.service.ts` | No changes - will work with Firebase Auth UIDs |
| `messaging.service.ts` | No changes - will work with Firebase Auth UIDs |
| `risk-alert.service.ts` | No changes - will work with Firebase Auth UIDs |
| `user.service.ts` | No changes - will work with Firebase Auth UIDs |
| `facilitator-student-link.service.ts` | No changes - will work with Firebase Auth UIDs |
| `work-hours.service.ts` | No changes - will work with Firebase Auth UIDs |
| `appointment-slot.service.ts` | No changes - will work with Firebase Auth UIDs |
| `assessment-template.service.ts` | No changes - will work with Firebase Auth UIDs |
| `assessment-response.service.ts` | No changes - will work with Firebase Auth UIDs |

### 4.2 Services Already Using Firebase Auth

| File | Notes |
|------|-------|
| `packages/shared-services/src/services/auth.service.ts` | Already uses Firebase Auth SDK - this is the correct implementation to follow |

---

## 5. Firestore Security Rules Changes Required

### 5.1 Current Rules Analysis

The current `firebase/firestore.rules` already expect `request.auth.uid` to be populated. The rules are correctly written but **fail in practice** because:

1. `isAuthenticated()` returns `false` (no Firebase Auth)
2. `userDoc()` returns null (no user document found for null UID)
3. All subsequent checks fail

### 5.2 Rules That Will Work After Migration

All existing rules will work correctly after migration. No changes to the rules are required.

### 5.3 Key Rule Functions (Already Correct)

```javascript
function isAuthenticated() {
  return request.auth != null;
}

function userDoc() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid));
}

function isActiveUser() {
  return isAuthenticated() && userDoc().data.isActive == true;
}

function userRole() {
  return userDoc().data.role;
}
```

### 5.4 Collections Protected by Rules

| Collection | Rule Status |
|------------|-------------|
| `users` | ✅ Will work - uses `request.auth.uid` |
| `profiles` | ✅ Will work |
| `courses` | ✅ Will work |
| `enrollments` | ✅ Will work |
| `assignments` | ✅ Will work |
| `submissions` | ✅ Will work |
| `notifications` | ✅ Will work |
| `device_tokens` | ✅ Will work |
| `announcements` | ✅ Will work |
| `audit_logs` | ✅ Will work |
| `risk_alerts` | ✅ Will work |
| `appointments` | ✅ Will work |
| `facilitator_student_links` | ✅ Will work |
| `conversations` | ✅ Will work |
| `messages` | ✅ Will work |
| `work_hours_schedules` | ✅ Will work |
| `appointment_slots` | ✅ Will work |
| `assessment_templates` | ✅ Will work |
| `assessment_questions` | ✅ Will work |
| `assessments` | ✅ Will work |
| `assessment_responses` | ✅ Will work |
| `assessment_attempts` | ✅ Will work |

---

## 6. Collections Affected

### 6.1 Primary Collection: `users`

**Current State:**
- Document ID: Custom generated (`user_{timestamp}`)
- Contains: uid, email, firstName, lastName, role, isActive, timestamps

**Target State:**
- Document ID: Firebase Auth UID
- Contains: uid, email, displayName, role, isActive, timestamps

### 6.2 Migration Strategy for Existing Users

**Option A: Migrate Existing Users (Recommended for Production)**

If there are existing users in the `users` collection:

1. **Create a migration script** to:
   - Read all existing user documents
   - For each user, create a Firebase Auth account with a known password
   - Update the document ID to match the Firebase Auth UID
   - Preserve all existing data

2. **Migration Script Pseudocode:**
```javascript
// Run once before deployment
for (const userDoc of existingUsers) {
  // Create Firebase Auth user
  const { user } = await createUserWithEmailAndPassword(auth, userDoc.email, tempPassword);
  
  // Update document with new ID
  await setDoc(doc(db, 'users', user.uid), {
    ...userDoc,
    uid: user.uid,
    displayName: `${userDoc.firstName} ${userDoc.lastName}`,
  });
  
  // Delete old document
  await deleteDoc(doc(db, 'users', userDoc.uid));
}
```

**Option B: Fresh Start (Recommended for Development)**

For development/testing environments:
- Delete all existing users
- Start fresh with Firebase Auth

### 6.3 Other Collections

All other collections reference users by UID. After migration:
- Existing relationships will be preserved if document IDs are updated
- New data will use Firebase Auth UIDs automatically

---

## 7. User Document Migration Strategy

### 7.1 Field Mapping

| Current Field | Target Field | Notes |
|---------------|--------------|-------|
| `uid` (custom) | `uid` (Firebase) | Must be updated to Firebase UID |
| `email` | `email` | Unchanged |
| `firstName` + `lastName` | `displayName` | Combined into single field |
| `role` | `role` | Unchanged |
| `isActive` | `isActive` | Unchanged |
| `createdAt` | `createdAt` | Unchanged |
| `updatedAt` | `updatedAt` | Unchanged |

### 7.2 Migration Steps

1. **Pre-migration:**
   - Backup Firestore database
   - Identify all users with custom UIDs

2. **During migration:**
   - Create Firebase Auth accounts for each user
   - Update document IDs to match Firebase UIDs
   - Combine firstName/lastName into displayName

3. **Post-migration:**
   - Verify all user documents are accessible
   - Test authentication flow

### 7.3 Handling Orphaned Accounts

If Firestore profile creation fails after Firebase account creation:

```typescript
// In registration flow
try {
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await createUserDocument(user.uid, profileData);
} catch (error) {
  // If profile creation fails, delete the Firebase Auth user
  await deleteUser(auth.currentUser);
  throw error;
}
```

---

## 8. Breaking Changes

### 8.1 Application-Level Breaking Changes

| Change | Impact | Mitigation |
|--------|--------|------------|
| `uid` format changes | All existing user references will break | Migrate user document IDs |
| `displayName` replaces `firstName`/`lastName` | UI may need updates | Update UI to use displayName |
| Password reset now functional | Users can reset passwords | Communicate to users |
| Session no longer in localStorage | Custom session code removed | Use Firebase Auth state |

### 8.2 API-Level Breaking Changes

| Change | Impact | Mitigation |
|--------|--------|------------|
| `UserDocument` type changes | Type mismatches | Update to use shared-types |
| `AuthUser` type changes | Type mismatches | Align with `AuthSession` |
| No more `user_${timestamp}` UIDs | Hardcoded UIDs will fail | Use Firebase UIDs |

### 8.3 Data-Level Breaking Changes

| Change | Impact | Mitigation |
|--------|--------|------------|
| User document IDs change | Foreign key references | Update all references |
| No password in Firestore | Security improvement | N/A - passwords never stored |

---

## 9. Rollback Strategy

### 9.1 If Migration Fails

1. **Revert Firestore Rules:**
   - Keep current rules (they're already correct)

2. **Revert Code:**
   - Git revert to previous commit
   - Or restore from backup branch

3. **Data Recovery:**
   - Restore Firestore from backup
   - Or re-run migration in reverse

### 9.2 Gradual Rollback

If issues are discovered after deployment:

1. **Feature Flag Approach:**
   - Add environment variable to switch between auth systems
   - Not recommended - adds complexity

2. **Recommended: Full Rollback**
   - Revert code changes
   - Restore data if needed

### 9.3 Pre-Rollback Checklist

- [ ] Backup current Firestore state
- [ ] Document all user UIDs before migration
- [ ] Test rollback procedure in development
- [ ] Communicate maintenance window

---

## 10. Risks

### 10.1 High Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing user data loss | Medium | High | Full backup before migration |
| Authentication completely broken | Low | Critical | Test thoroughly in dev |
| Password reset emails not received | Low | Medium | Configure Firebase email templates |

### 10.2 Medium Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| User document ID mismatch | High | Medium | Update all references to use Firebase UID |
| Session persistence issues | Low | Medium | Test onAuthStateChanged behavior |
| Role-based access not working | Low | High | Verify rules with test users |

### 10.3 Low Priority Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| UI display name issues | Medium | Low | Update UI components |
| Type mismatches | High | Low | Align types with shared-types |

---

## 11. Estimated Implementation Phases

### Phase 1: Analysis & Planning (COMPLETE)
- [x] Analyze current authentication flow
- [x] Document all affected files
- [x] Create migration plan

### Phase 2: Core Authentication Implementation
- [ ] Update `apps/web/src/lib/auth.ts` to use Firebase Auth SDK
- [ ] Update `apps/web/src/hooks/useAuth.tsx` to use `onAuthStateChanged`
- [ ] Remove `apps/web/src/types/auth.types.ts` (use shared-types)
- [ ] Update `apps/web/src/components/auth/ProtectedRoute.tsx` if needed

### Phase 3: UI Updates
- [ ] Update `apps/web/src/pages/LoginPage.tsx`
- [ ] Update `apps/web/src/pages/RegisterPage.tsx`
- [ ] Update `apps/web/src/pages/ForgotPasswordPage.tsx`
- [ ] Update any components using `firstName`/`lastName` to use `displayName`

### Phase 4: User Document Migration
- [ ] Create migration script (if needed for production)
- [ ] Run migration in development environment
- [ ] Verify all user documents accessible

### Phase 5: Testing
- [ ] Test student registration
- [ ] Test facilitator registration
- [ ] Test login/logout flow
- [ ] Test session persistence
- [ ] Test route protection
- [ ] Test Firestore permissions
- [ ] Test role-based navigation
- [ ] Test appointment booking
- [ ] Test messaging
- [ ] Test assessment submission
- [ ] Test risk alerts

### Phase 6: Deployment
- [ ] Deploy to staging
- [ ] Run migration script (production)
- [ ] Deploy to production
- [ ] Monitor for errors

---

## 12. Testing Checklist

### 12.1 Authentication Tests

- [ ] Student can register with email/password
- [ ] Facilitator can register with email/password
- [ ] Super admin can register with email/password
- [ ] User cannot register with existing email
- [ ] User can login with correct credentials
- [ ] User cannot login with wrong credentials
- [ ] Deactivated user cannot login
- [ ] User can logout
- [ ] Session persists on page refresh
- [ ] Password reset email is sent
- [ ] Password reset link works

### 12.2 Authorization Tests

- [ ] Student can only access student routes
- [ ] Facilitator can only access facilitator routes
- [ ] Super admin can only access admin routes
- [ ] Unauthenticated user redirected to login

### 12.3 Firestore Permission Tests

- [ ] Student can read own user document
- [ ] Student can read own appointments
- [ ] Student can create appointment request
- [ ] Facilitator can read assigned student documents
- [ ] Facilitator can update appointment status
- [ ] Super admin can read all users
- [ ] All users can read published assessment templates

### 12.4 Feature Tests

- [ ] Appointment booking works end-to-end
- [ ] Messaging between student/facilitator works
- [ ] Assessment submission creates risk alerts
- [ ] Work hours can be set by facilitator
- [ ] All existing features work with Firebase Auth

---

## 13. Implementation Notes

### 13.1 Key Implementation Details

1. **Use the existing `auth.service.ts`** as reference - it already correctly uses Firebase Auth
2. **The `useAuth` hook** must use `onAuthStateChanged` for session management
3. **User document ID** must match Firebase Auth UID
4. **No password storage** in Firestore - Firebase Auth handles this
5. **Error handling** should use Firebase Auth error codes

### 13.2 Firebase Auth Error Codes

| Code | Meaning |
|------|---------|
| `auth/user-not-found` | No user with this email |
| `auth/wrong-password` | Incorrect password |
| `auth/email-already-in-use` | Email already registered |
| `auth/weak-password` | Password too short |
| `auth/invalid-email` | Invalid email format |

### 13.3 Type Alignment

The `apps/web/src/types/auth.types.ts` should be removed and the web app should use types from `packages/shared-types/src/types/auth.types.ts` and `packages/shared-types/src/types/user.types.ts`.

---

## 14. Conclusion

This migration will:

1. **Fix the core issue**: Firestore security rules will work with `request.auth.uid`
2. **Improve security**: Firebase Auth handles password hashing and session management
3. **Reduce code complexity**: Remove custom session management
4. **Enable password reset**: Users can reset their own passwords
5. **Maintain all existing features**: No changes to business logic

The migration is **low-risk** because:
- The Firestore rules are already correctly written
- The shared-services already have Firebase Auth integration
- Only the web app's auth layer needs updating
- All other code remains unchanged

---

## 15. Validation Summary

### 15.1 Files Verified

| File | Status | Notes |
|------|--------|-------|
| `apps/web/src/lib/auth.ts` | ✅ EXISTS | Custom auth - needs rewrite |
| `apps/web/src/hooks/useAuth.tsx` | ✅ EXISTS | Uses localStorage - needs update |
| `apps/web/src/types/auth.types.ts` | ✅ EXISTS | Duplicate types - should be removed |
| `apps/web/src/pages/LoginPage.tsx` | ✅ EXISTS | Uses `getRoleRedirect` - needs update |
| `apps/web/src/pages/RegisterPage.tsx` | ✅ EXISTS | Uses `getRoleRedirect` - needs update |
| `apps/web/src/pages/ForgotPasswordPage.tsx` | ✅ EXISTS | Non-functional - needs update |
| `apps/web/src/components/auth/ProtectedRoute.tsx` | ✅ EXISTS | No changes needed |
| `packages/shared-services/src/services/auth.service.ts` | ✅ EXISTS | Already uses Firebase Auth - reference implementation |
| `packages/shared-services/src/firebase/auth.ts` | ✅ EXISTS | Already exports Firebase Auth functions |
| `packages/shared-services/src/firebase/app.ts` | ✅ EXISTS | Already initializes Firebase |

### 15.2 No Additional Files Required

All files identified in the migration plan exist. No additional files need to be created or modified.

### 15.3 No Phase 4/Phase 7 Dependencies on Custom Auth

- Services receive `actorRole` and `userId` as parameters
- UI components get these from `useAuth()` hook
- No direct dependency on custom auth implementation
- All features will work once Firebase Auth is integrated

---

## 16. Implementation Checklist

### Pre-Implementation
- [x] Verify all files exist
- [x] Confirm shared-services AuthService is production-ready
- [x] Confirm no Phase 4/Phase 7 dependencies on custom auth
- [x] Create migration plan document

### Phase 1: Core Authentication (apps/web/src/lib/auth.ts)
- [ ] Replace `registerUser` with `createUserWithEmailAndPassword`
- [ ] Replace `loginUser` with `signInWithEmailAndPassword`
- [ ] Replace `logoutUser` with `signOut(auth)`
- [ ] Replace `onAuthChange` with `onAuthStateChanged`
- [ ] Remove `getRoleRedirect` (move to separate utility)
- [ ] Add `getFirebaseAuth` import from shared-services

### Phase 2: Update useAuth Hook
- [ ] Use `onAuthStateChanged` for session management
- [ ] Remove localStorage session handling
- [ ] Fetch user profile from Firestore on auth state change
- [ ] Handle Firebase Auth errors properly

### Phase 3: Type Alignment
- [ ] Remove `apps/web/src/types/auth.types.ts`
- [ ] Use types from `@spartan-g/shared-types`
- [ ] Update `UserDocument` to use `displayName` instead of `firstName`/`lastName`

### Phase 4: UI Updates
- [ ] Update LoginPage error handling
- [ ] Update RegisterPage to use Firebase Auth registration flow
- [ ] Update ForgotPasswordPage to use `sendPasswordResetEmail`

### Phase 5: Clean Up
- [ ] Remove `getRoleRedirect` from auth.ts (move to utils)
- [ ] Update any components using `firstName`/`lastName` to use `displayName`
- [ ] Verify all imports are correct

### Phase 6: Testing
- [ ] Test registration flow
- [ ] Test login flow
- [ ] Test logout flow
- [ ] Test session persistence
- [ ] Test route protection
