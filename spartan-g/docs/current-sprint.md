# Current Sprint: Firebase Authentication Migration

**Goal**: Replace custom Firestore auth with Firebase Auth to fix security rules

**Status**: ✅ Complete

## Completed Tasks

- [x] Replace `apps/web/src/lib/auth.ts` with Firebase Auth SDK
- [x] Update `apps/web/src/hooks/useAuth.tsx` to use `onAuthStateChanged`
- [x] Remove duplicate auth types (`apps/web/src/types/auth.types.ts`)
- [x] Update LoginPage error handling
- [x] Update RegisterPage registration flow
- [x] Implement ForgotPasswordPage (was already using the hook)
- [x] Update ProtectedRoute and Header to use shared types

## Definition of Done

- [x] Users can register with email/password
- [x] Users can login with email/password
- [x] Users can logout
- [x] Session persists on page refresh
- [x] Password reset works
- [x] Firestore security rules work (request.auth.uid populated)

## Key Files Modified

| File | Action |
|------|--------|
| `apps/web/src/lib/auth.ts` | Complete rewrite with Firebase Auth SDK |
| `apps/web/src/hooks/useAuth.tsx` | Use onAuthStateChanged, shared types |
| `apps/web/src/types/auth.types.ts` | Removed (use shared-types) |
| `apps/web/src/pages/LoginPage.tsx` | No changes needed |
| `apps/web/src/pages/RegisterPage.tsx` | Updated to use shared types |
| `apps/web/src/pages/ForgotPasswordPage.tsx` | No changes needed |
| `apps/web/src/components/auth/ProtectedRoute.tsx` | Updated to use shared types |
| `apps/web/src/components/layout/Header.tsx` | Updated to use shared types |
| `packages/shared-types/src/types/auth.types.ts` | Added LoginFormData, RegisterFormData |

## Notes

- Use fresh start for development (no user migration needed)
- User document ID = Firebase Auth UID
- No password storage in Firestore
- Uses `createUserWithEmailAndPassword()`, `signInWithEmailAndPassword()`, `signOut()`, `onAuthStateChanged()`

## Next Steps

The authentication migration is complete. The next phase is to verify:
1. Student registration
2. Facilitator registration
3. Login
4. Logout
5. Session persistence
6. Route protection
7. Firestore permissions