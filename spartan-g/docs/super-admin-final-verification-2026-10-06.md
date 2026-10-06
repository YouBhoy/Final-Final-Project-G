# Final Super Admin Read-Only Verification

Date: 2026-10-06
Scope: Final verification of the current Super Admin implementation on Firebase Spark/no-cost configuration

No source code, Firebase data, Firebase plan, or deployment configuration was modified during this verification.

## Authentication and Authorization

- Live Firebase audit confirms one active Super Admin.
- The role is stored in `users/{uid}.role`.
- The account is active through `users/{uid}.isActive`.
- Custom Claims remain unused.
- `/admin/*` is protected by `ProtectedRoute` with `allowedRoles={['super_admin']}`.
- Student and Facilitator routes use separate role guards.
- Inactive users are rejected during authentication and by Firestore rules.
- Firestore authorization uses the authenticated user's Firestore `users/{uid}` document, not only a frontend check.
- No Custom Claims were introduced.

The existing frontend session may not immediately react to an administrator changing `isActive`, but Firestore rules still deny later protected reads and writes.

## Profile Management

The Admin profile flow is:

```text
AdminUserDetailPage
  -> userRepository.getById(uid)
  -> profileRepository.getById(uid)
  -> adminService.saveUserProfile()
  -> userService.updateCampus()
  -> userService.updateProfile()
  -> users/{uid} and profiles/{uid}
```

The Student and Facilitator portals consume the same `users/{uid}` and `profiles/{uid}` documents.

Admin-editable fields:

- Display name
- Campus
- Bio
- Phone
- Institution
- Pronouns
- Gender

These fields appear in the normal portal profile flows after reload or remount. The Admin UI does not edit `avatarUrl` or arbitrary profile metadata.

Security result:

- Students can update their own profile only.
- Facilitators can update their own profile only.
- Super Admins can update other users' profiles.

## Firestore Security

The current local rules match the rules deployment that succeeded earlier in the session.

### Users

- Super Admins can read users.
- Super Admins can update and delete users.
- Normal users cannot change their own `role`.
- Normal users cannot change their own `isActive` status.
- Self-registration only allows `student` or `facilitator`.
- Students cannot modify other users.
- Facilitators cannot modify other users.

Caveat: owner updates are broadly allowed for fields other than `role` and `isActive`. The rules do not strictly restrict users from changing arbitrary non-authorization fields in their own `users/{uid}` document.

### Profiles

- Super Admins can read and update profiles.
- Owners can read and update their own profile.
- Students cannot modify another user's profile.
- Facilitators cannot modify another user's profile.

### Resources

- Super Admins can create, read, update, and delete resources.
- Students can read only active resources with audience `all` or `students`.
- Facilitators can read only active resources with audience `all` or `facilitators`.
- Draft/inactive resources are hidden from normal users.
- Direct Firestore access cannot bypass the audience restriction when the deployed rules match the successful rules deployment.

The repository query matches the rule requirements:

- Student query: `audience in ['all', 'students']`
- Facilitator query: `audience in ['all', 'facilitators']`
- Both queries include `isActive == true`.

The required composite index is deployed:

```text
audience ASC
isActive ASC
createdAt DESC
```

### Audit Logs

Rules enforce:

- Super Admin read access only.
- Super Admin create access only.
- `actorId == request.auth.uid`.
- Known action names only.
- Approved target resources only.
- No updates or deletes.

Metadata remains client-supplied for browser-generated events, so it is not fully trustworthy.

## Resource Management on Spark

The live read-only audit confirmed:

- Resources: `3`
- Audit logs: `5`
- No Storage-backed resource files are attached.

Firestore-only resource workflows are compatible with the current plan:

- Create article.
- Create YouTube resource.
- Edit resource.
- Change title, description, category, tags, and audience.
- Publish/unpublish through `isActive`.
- Delete resource.
- Store external URLs.
- Embed recognized YouTube URLs.

The live data includes two video resources with YouTube URLs, confirming that the Firestore-only YouTube workflow is active.

YouTube embeds use:

```text
https://www.youtube-nocookie.com/embed/{videoId}?rel=0
```

Non-YouTube URLs remain normal external links.

## Audit Logging

| Action | Source | Runtime location | Tamper resistance |
|---|---|---|---|
| Profile edits | `admin.service.ts` | Browser-side Firestore and audit write | Actor/action/resource constrained; metadata client-controlled |
| Resource creation | `resource.service.ts` | Browser-side | Actor/action/resource constrained; metadata client-controlled |
| Resource edits | `resource.service.ts` | Browser-side | Same limitation |
| Resource publishing/unpublishing | `resource.service.ts` via `isActive` | Browser-side | Same limitation |
| Resource deletion | `resource.service.ts` | Browser-side | Same limitation |
| Password changes | `adminUserFunctions.ts` | Server-side source | Stronger; Admin SDK writes the audit event |
| Account-name changes | `adminUserFunctions.ts` | Server-side source | Stronger; Admin SDK writes the audit event |

Browser-generated audit events are not fully secure or tamper-proof.

## Password Management

Source verification confirms:

- Admin SDK credentials remain server-side.
- The Function requires authentication.
- The Function verifies `super_admin`.
- The Function verifies `isActive === true`.
- Self-password changes through the Admin Function are rejected.
- Passwords must be at least eight characters.
- `admin.auth().updateUser()` is used.
- Password changes are audited server-side.
- Functions are exported from `firebase/functions/src/index.ts`.

### Status: SOURCE ONLY

The callable Functions compile successfully but are not deployed because the Firebase project requires Blaze for Cloud Build and related APIs.

## Storage Limitation

### WORKING WITHOUT STORAGE

- Firebase Authentication.
- Firestore user management.
- Firestore profile management.
- Firestore resource metadata.
- Article resources.
- YouTube resources.
- External URL resources.
- Resource audience filtering.
- Resource publish/unpublish state.
- Firestore audit records.
- Firestore rules and indexes.

### REQUIRES STORAGE

- Resource file uploads.
- Resource file replacement.
- Resource file deletion.
- Avatar uploads.
- Storage-backed downloads.
- Storage rules deployment.

Firebase Console confirmed that Storage requires billing setup for this project. No Storage setup was performed.

## Spark Compatibility

Concrete blockers found:

- Firebase Storage is not initialized and requires billing setup for this project.
- Firebase Cloud Functions deployment requires Blaze because Cloud Build and Artifact Registry APIs must be enabled.

No other unexpected Blaze requirement was identified in the repository.

## Live Data Verification

The read-only Firebase audit confirmed:

- 1 Super Admin.
- 7 Students.
- 2 Facilitators.
- 9 profiles.
- 3 resources.
- 5 audit logs.
- 0 custom-claim users.

These facts were verified against the live Firebase project using `scripts/audit-firebase.mjs`.

## Build Verification

All requested checks passed:

```text
npm run build:web
npm run typecheck --workspace=@spartan-g/web
npm run build --prefix firebase/functions
```

The web build produced only existing bundle-size and dynamic-import warnings.

The workspace-wide TypeScript check was not rerun during this verification. The earlier audit recorded unrelated mobile/shared-ui failures.

### WORKING ON SPARK

- Super Admin authentication using Firestore roles.
- Protected Admin routing.
- User list and profile management.
- Student and Facilitator profile editing.
- Firestore rules and indexes.
- Firestore-only resource creation and management.
- YouTube resource embeds.
- External URL resources.
- Resource audience restrictions.
- Basic audit-log creation and viewing.
- Web build and web typecheck.
- Firebase Functions source compilation.

### REQUIRES BLAZE / STORAGE

- Firebase Storage initialization.
- Storage rules deployment.
- Resource file uploads/replacements/deletions.
- Avatar uploads.
- Cloud Functions deployment.
- Live Admin password changes.
- Live server-side account-name synchronization.

### SOURCE-ONLY FEATURES

- `adminSetUserPassword`.
- `adminUpdateUser`.
- Server-side password audit logging.
- Server-side account-name audit logging.
- Storage-backed resource file handling.

### SECURITY LIMITATIONS

- Browser-generated profile/resource audit metadata is not fully trustworthy.
- Profile/resource mutations are still browser-originated.
- User-owned `users/{uid}` updates are broader than a strict field allowlist.
- Existing portal sessions may not immediately reflect an `isActive` change.
- No automated end-to-end authorization tests were found.
- Storage-backed security could not be live-tested because Storage is unavailable.

### UNRELATED PROJECT ISSUES

- Unstaged mobile files remain in the worktree.
- `.vscode/settings.json`, `apps/web/src/env-setup.ts`, `apps/mobile/expo-start.log`, and the root-level `e` file remain outside the Super Admin commit.
- Earlier workspace-wide TypeScript failures remain in mobile/shared-ui areas.
- These issues were not modified during this verification.

### FINAL VERDICT

## READY WITH DOCUMENTED LIMITATIONS

The Firestore-based Super Admin and resource metadata workflows are working on the current Spark/no-cost configuration. Storage-backed features, callable password management, and fully trusted server-side audit events remain unavailable until the project moves to Blaze and deploys the Functions/Storage components.
