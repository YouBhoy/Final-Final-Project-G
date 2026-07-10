# Authentication Implementation Roadmap

## 1. Current Status

### What is Complete
- [x] Firebase project configured with API keys in `.env`
- [x] Firebase SDK initialized in `apps/web/src/firebase/firebase.ts`
- [x] Shared-services `auth.service.ts` already uses Firebase Auth SDK
- [x] Firestore security rules already written for Firebase Auth
- [x] User repository exists for Firestore profile operations
- [x] Profile repository exists for additional profile data

### What is Still Using the Old Authentication System
- [x] `apps/web/src/lib/auth.ts` - ✅ Rewritten with Firebase Auth SDK
- [x] `apps/web/src/hooks/useAuth.tsx` - ✅ Uses onAuthStateChanged
- [x] `apps/web/src/types/auth.types.ts` - ✅ Removed (using shared-types)
- [x] `apps/web/src/pages/LoginPage.tsx` - ✅ Uses Firebase Auth
- [x] `apps/web/src/pages/RegisterPage.tsx` - ✅ Uses Firebase Auth

### Current Blockers
- **Firestore security rules fail** - `request.auth.uid` is always null because users are never authenticated through Firebase Auth
- **No password verification** - The `loginUser()` function only checks if a user document exists
- **Custom UID generation** - Uses `user_${Date.now()}` instead of Firebase's auto-generated UIDs
- **No session persistence** - Relies on localStorage which doesn't sync with Firebase

---

## 2. Implementation Phases

### Phase 1 — Core Firebase Authentication

**Goal:** Replace custom Firestore authentication with Firebase Authentication SDK.

**Changes:**
- Replace `registerUser()` with `createUserWithEmailAndPassword()`
- Replace `loginUser()` with `signInWithEmailAndPassword()`
- Replace `logoutUser()` with `signOut()`
- Replace `onAuthChange()` with `onAuthStateChanged()`

**File:** `apps/web/src/lib/auth.ts`

**Implementation Steps:**
1. Import Firebase Auth functions from `firebase/auth`
2. Import `getFirebaseAuth` from shared-services
3. Rewrite `registerUser()`:
   - Call `createUserWithEmailAndPassword(auth, email, password)`
   - Get Firebase UID from result
   - Create Firestore user document with Firebase UID
4. Rewrite `loginUser()`:
   - Call `signInWithEmailAndPassword(auth, email, password)`
   - Get Firebase UID from result
   - Fetch Firestore user profile
5. Rewrite `logoutUser()`:
   - Call `signOut(auth)`
6. Rewrite `onAuthChange()`:
   - Use `onAuthStateChanged(auth, callback)`
   - On auth state change, fetch user profile from Firestore

### Phase 2 — Registration Flow

**Goal:** Create Firebase Auth user and Firestore profile atomically.

**Implementation Steps:**
1. In `registerUser()`:
   - Call `createUserWithEmailAndPassword()` first
   - On success, create Firestore user document with Firebase UID
   - If Firestore creation fails, delete Firebase Auth user
   - Return combined user data (Firebase + Firestore profile)

**Error Handling:**
```typescript
try {
  const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
  await userRepository.create(firebaseUser.uid, {
    uid: firebaseUser.uid,
    email,
    displayName: `${firstName} ${lastName}`,
    role,
    isActive: true,
  });
} catch (error) {
  // If profile creation fails, clean up Firebase Auth user
  if (firebaseUser) {
    await deleteUser(firebaseUser);
  }
  throw error;
}
```

### Phase 3 — Login Flow

**Goal:** Authenticate with Firebase and validate Firestore profile.

**Implementation Steps:**
1. In `loginUser()`:
   - Call `signInWithEmailAndPassword(auth, email, password)`
   - On success, fetch Firestore user profile by Firebase UID
   - If profile doesn't exist, sign out and throw error
   - If profile exists but `isActive` is false, sign out and throw error
   - If profile exists and is active, return user data

**Validation:**
- [ ] Profile exists in Firestore
- [ ] `isActive` is true
- [ ] `role` is valid (student, facilitator, or super_admin)

### Phase 4 — Session Management

**Goal:** Remove localStorage and use Firebase's built-in session management.

**Changes:**
- Remove `localStorage.setItem("auth_user", ...)`
- Remove `localStorage.getItem("auth_user")`
- Use `onAuthStateChanged()` for session state
- Remove custom `AuthStatus` idle state (Firebase handles this)

**File:** `apps/web/src/hooks/useAuth.tsx`

**Implementation Steps:**
1. In `AuthProvider`:
   - Subscribe to `onAuthStateChanged(auth, callback)`
   - On user change, fetch Firestore profile
   - Set user state with combined data
2. Remove `onAuthChange` import (use Firebase's)
3. Update `status` values:
   - `loading` - Initial state
   - `authenticated` - User signed in with valid profile
   - `unauthenticated` - No user or profile invalid

### Phase 5 — Forgot Password

**Goal:** Enable password reset functionality.

**Changes:**
- Replace `resetPassword()` with `sendPasswordResetEmail()`

**File:** `apps/web/src/lib/auth.ts`

**Implementation Steps:**
1. In `resetPassword()`:
   - Call `sendPasswordResetEmail(auth, email)`
   - Handle Firebase Auth errors
2. Update `ForgotPasswordPage.tsx`:
   - Remove error handling for "not implemented"
   - Handle Firebase Auth errors (user-not-found, invalid-email, etc.)

### Phase 6 — Cleanup

**Goal:** Remove duplicate code and align types.

**Changes:**
- Remove `apps/web/src/types/auth.types.ts`
- Use types from `@spartan-g/shared-types`
- Move `getRoleRedirect()` to a routing utility
- Keep `firstName` and `lastName` in Firestore (compute `displayName` when needed)

**Type Alignment:**
- `AuthUser` → Use `AuthSession` from shared-types
- `UserDocument` → Use from shared-types (has `displayName` field)
- `RegisterFormData` → Keep in web app (UI-specific)
- `LoginFormData` → Keep in web app (UI-specific)

**Note on displayName:**
The shared-types `UserDocument` has `displayName` field. The current web app types have `firstName` and `lastName`. We have two options:
1. Update Firestore to use `displayName` (simpler)
2. Keep `firstName`/`lastName` and compute `displayName` on read (more flexible)

**Recommendation:** Use `displayName` in Firestore to match shared-types, and combine `firstName`/`lastName` during registration.

### Phase 7 — Testing

**Goal:** Verify all authentication flows work correctly.

---

## 3. Complete Testing Checklist

### Registration Tests
- [ ] Student can register with valid email/password
- [ ] Facilitator can register with valid email/password
- [ ] Super admin can register with valid email/password
- [ ] Registration fails with existing email
- [ ] Registration fails with weak password (< 6 characters)
- [ ] Registration fails with invalid email format
- [ ] Firestore user document is created on successful registration
- [ ] Firebase Auth user is created on successful registration
- [ ] Firebase Auth user is deleted if Firestore creation fails

### Login Tests
- [ ] User can login with correct credentials
- [ ] Login fails with wrong password
- [ ] Login fails with non-existent email
- [ ] Login fails for deactivated user (isActive: false)
- [ ] Session persists on page refresh
- [ ] User is redirected to correct dashboard after login

### Logout Tests
- [ ] User can logout successfully
- [ ] Session is cleared after logout
- [ ] User is redirected to login page after logout

### Session Persistence Tests
- [ ] Session persists on page refresh
- [ ] Session persists on browser restart
- [ ] Session is cleared when user is deleted
- [ ] Session is cleared when user is deactivated

### Protected Routes Tests
- [ ] Unauthenticated user redirected to /login
- [ ] Student cannot access /facilitator/* routes
- [ ] Student cannot access /admin/* routes
- [ ] Facilitator cannot access /student/* routes
- [ ] Facilitator cannot access /admin/* routes
- [ ] Super admin cannot access /student/* routes
- [ ] Super admin cannot access /facilitator/* routes

### Student Permissions Tests
- [ ] Student can read own user document
- [ ] Student can read own appointments
- [ ] Student can create appointment request
- [ ] Student can read published assessment templates
- [ ] Student can start assessment
- [ ] Student can submit assessment
- [ ] Student can read own messages
- [ ] Student can send messages

### Facilitator Permissions Tests
- [ ] Facilitator can read own user document
- [ ] Facilitator can read assigned student documents
- [ ] Facilitator can read own appointments
- [ ] Facilitator can update appointment status
- [ ] Facilitator can read all assessment templates
- [ ] Facilitator can read risk alerts
- [ ] Facilitator can read own messages
- [ ] Facilitator can send messages

### Super Admin Permissions Tests
- [ ] Super admin can read all user documents
- [ ] Super admin can read all appointments
- [ ] Super admin can read all assessment templates
- [ ] Super admin can create/edit/delete templates
- [ ] Super admin can read all risk alerts

### Firestore Security Rules Tests
- [ ] `isAuthenticated()` returns true for signed-in users
- [ ] `isStudent()` returns true for students
- [ ] `isFacilitator()` returns true for facilitators
- [ ] `isSuperAdmin()` returns true for super admins
- [ ] Users collection rules work correctly
- [ ] Appointments collection rules work correctly
- [ ] Messages collection rules work correctly
- [ ] Assessment rules work correctly

---

## 4. Files To Modify

| File | Responsibility | Expected Changes |
|------|---------------|----------------|
| `apps/web/src/lib/auth.ts` | Core auth functions | Complete rewrite with Firebase Auth SDK |
| `apps/web/src/hooks/useAuth.tsx` | Auth context/hook | Use `onAuthStateChanged`, remove localStorage |
| `apps/web/src/types/auth.types.ts` | Auth types | Remove (use shared-types) |
| `apps/web/src/pages/LoginPage.tsx` | Login UI | Update error handling, use Firebase Auth |
| `apps/web/src/pages/RegisterPage.tsx` | Registration UI | Update to use Firebase Auth registration |
| `apps/web/src/pages/ForgotPasswordPage.tsx` | Password reset UI | Implement `sendPasswordResetEmail` |
| `apps/web/src/components/auth/ProtectedRoute.tsx` | Route protection | No changes needed |
| `apps/web/src/navigation/AppRouter.tsx` | Router | No changes needed |
| `apps/web/src/lib/assessments.ts` | Assessment wrappers | No changes needed |

---

## 5. Risks

### Migration Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Existing user data loss | High | Backup Firestore before migration, use fresh start for dev |
| Authentication completely broken | Critical | Test in development first, have rollback plan |
| Password reset emails not received | Medium | Configure Firebase email templates, test in dev |
| User document ID mismatch | High | Use Firebase UID as document ID, no migration needed for fresh start |
| Session persistence issues | Medium | Test `onAuthStateChanged` behavior thoroughly |
| Role-based access not working | High | Verify rules with test users for each role |

### Rollback Strategy

1. **Code Rollback:**
   - Git revert to commit before migration
   - Or restore from backup branch

2. **Data Rollback:**
   - For development: No data to restore (fresh start)
   - For production: Restore Firestore from backup

3. **Pre-Rollback Checklist:**
   - [ ] Commit current state
   - [ ] Backup Firestore (if production)
   - [ ] Document current user UIDs

---

## 6. Completion Checklist

### Phase 1 — Core Firebase Authentication
- [x] `apps/web/src/lib/auth.ts` rewritten
- [x] `createUserWithEmailAndPassword()` implemented
- [x] `signInWithEmailAndPassword()` implemented
- [x] `signOut()` implemented
- [x] `onAuthStateChanged()` implemented

### Phase 2 — Registration Flow
- [x] Firebase Auth user created on registration
- [x] Firestore profile created on registration
- [ ] Orphaned account cleanup implemented (optional - can be done manually)
- [ ] Registration tested

### Phase 3 — Login Flow
- [x] Firebase Auth sign-in implemented
- [x] Profile validation implemented
- [x] Deactivated user handling implemented
- [ ] Login tested

### Phase 4 — Session Management
- [x] `useAuth` uses `onAuthStateChanged`
- [x] localStorage removed
- [ ] Session persistence works
- [ ] Session management tested

### Phase 5 — Forgot Password
- [x] `sendPasswordResetEmail()` implemented
- [x] ForgotPasswordPage updated
- [ ] Password reset tested

### Phase 6 — Cleanup
- [x] `apps/web/src/types/auth.types.ts` removed
- [x] Types aligned with shared-types
- [ ] `getRoleRedirect()` moved to utility
- [x] Code cleanup complete

### Phase 7 — Testing
- [ ] All registration tests pass
- [ ] All login tests pass
- [ ] All logout tests pass
- [ ] All session persistence tests pass
- [ ] All protected route tests pass
- [ ] All permission tests pass
- [ ] All Firestore security rules tests pass

### Final Verification
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] All features work end-to-end
