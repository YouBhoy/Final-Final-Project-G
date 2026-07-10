# Current Sprint: Firebase Authentication Migration

**Goal**: Replace custom Firestore auth with Firebase Auth to fix security rules

**Status**: In Progress

## Remaining Tasks

- [ ] Replace `apps/web/src/lib/auth.ts` with Firebase Auth SDK
- [ ] Update `apps/web/src/hooks/useAuth.tsx` to use `onAuthStateChanged`
- [ ] Remove duplicate auth types (`apps/web/src/types/auth.types.ts`)
- [ ] Update LoginPage error handling
- [ ] Update RegisterPage registration flow
- [ ] Implement ForgotPasswordPage

## Definition of Done

- [ ] Users can register with email/password
- [ ] Users can login with email/password
- [ ] Users can logout
- [ ] Session persists on page refresh
- [ ] Password reset works
- [ ] Firestore security rules work (request.auth.uid populated)

## Key Files

| File | Action |
|------|--------|
| `apps/web/src/lib/auth.ts` | Complete rewrite |
| `apps/web/src/hooks/useAuth.tsx` | Use onAuthStateChanged |
| `apps/web/src/types/auth.types.ts` | Remove (use shared-types) |
| `apps/web/src/pages/LoginPage.tsx` | Update error handling |
| `apps/web/src/pages/RegisterPage.tsx` | Update registration flow |
| `apps/web/src/pages/ForgotPasswordPage.tsx` | Implement password reset |

## Reference Implementation

Use `packages/shared-services/src/services/auth.service.ts` as reference - it already correctly uses Firebase Auth SDK.

## Notes

- Use fresh start for development (no user migration needed)
- User document ID = Firebase Auth UID
- No password storage in Firestore
- Use `createUserWithEmailAndPassword()`, `signInWithEmailAndPassword()`, `signOut()`, `onAuthStateChanged()`