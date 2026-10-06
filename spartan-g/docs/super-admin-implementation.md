# Super Admin Implementation Guide

This document describes the existing Super Admin implementation and the controlled steps required to validate or deploy it.

## Architecture

The web portal uses the existing React `PortalLayout` and Firebase-backed shared services.

- Role: `super_admin`
- Portal route: `/admin/*`
- Role source of truth: `users/{uid}.role` in Firestore
- Profile data: `users/{uid}` and `profiles/{uid}`
- Resource data: `resources/{resourceId}`
- Audit data: `audit_logs/{logId}`
- Privileged Authentication operations: Firebase callable Functions using the Admin SDK

The browser does not contain Firebase Admin SDK credentials.

## Authorization

Frontend route protection is implemented in:

- `apps/web/src/components/auth/ProtectedRoute.tsx`
- `apps/web/src/navigation/SuperAdminPortalRoutes.tsx`

Backend authorization is implemented in:

- `firebase/firestore.rules`
- `firebase/storage.rules`
- `firebase/functions/src/adminUserFunctions.ts`

The Firestore and Storage rules read the caller's active role from `users/{request.auth.uid}`. A client-side role value is not sufficient to obtain Super Admin access.

Resource reads use role-compatible queries:

- Students query `audience in ['all', 'students']`.
- Facilitators query `audience in ['all', 'facilitators']`.
- Super Admins may read all resources.

The resource query and rule must remain aligned. Changing the resource audience values requires updating both the repository query and `firebase/firestore.rules`.

## Cloud Functions

The exported privileged Functions are:

- `adminSetUserPassword`
- `adminUpdateUser`

Source:

- `firebase/functions/src/adminUserFunctions.ts`
- `firebase/functions/src/index.ts`

Each Function verifies that the caller is authenticated, active, and has the `super_admin` role by reading Firestore with the Admin SDK.

Password changes must remain server-side. Do not replace them with client-side `updatePassword()` for another user.

## Provisioning

Super Admin accounts are not self-registered. The provisioning script is:

```text
scripts/promote-superadmin.mjs
```

It requires a Firebase Admin service-account file at `scripts/service-account.json`. The file is ignored by Git and must never be committed or included in the web build.

The script changes:

1. The Firebase Auth user is looked up by email.
2. `users/{uid}.role` is set to `super_admin`.
3. `users/{uid}.isActive` is set to `true`.
4. `profiles/{uid}` is created if missing.

The script does not create a new Firebase Auth user. Demotion changes the Firestore role to `student`; it does not delete the account.

Do not run the provisioning script until the exact account identity has been explicitly approved.

## Resource Management

The Super Admin resource page is:

```text
apps/web/src/pages/admin/AdminResourcesPage.tsx
```

Shared resource services are:

- `packages/shared-services/src/repositories/resource.repository.ts`
- `packages/shared-services/src/services/resource.service.ts`
- `packages/shared-services/src/services/storage.service.ts`

Resources support:

- Create, update, and delete operations.
- Draft and published status through `isActive`.
- `all`, `students`, and `facilitators` audiences.
- External URLs.
- Storage-backed file uploads, replacement, and deletion.

File replacement uploads the new file before removing the old file. If the Firestore metadata update fails, the new upload is cleaned up where possible and the old file remains available.

## Audit Logging

The shared audit service writes to the existing `audit_logs` collection. Known action names are defined in:

```text
packages/shared-types/src/constants/audit.ts
```

Password and account-name changes are recorded by the callable Functions. Profile and resource mutations currently perform their Firestore/Storage mutation from the browser and then write a constrained audit event. Firestore rules restrict audit creation to active Super Admins, enforce the actor UID, and allow only known actions and target resources.

These client-originated mutation records are an operational trail, not a complete tamper-proof forensic log. Moving profile/resource mutations into trusted Functions would be the next hardening step if stronger audit guarantees are required.

## Local Validation

Run from the `spartan-g` repository root:

```text
npm run build:web
npm run typecheck --workspace=@spartan-g/web
npm run build --prefix firebase/functions
```

Validate the Firestore index configuration:

```text
node -e "JSON.parse(require('fs').readFileSync('firebase/firestore.indexes.json','utf8')); console.log('valid')"
```

The workspace-wide typecheck currently includes unrelated mobile/shared-ui failures. Do not modify those areas solely to validate the web Super Admin work.

## Deployment

Deployment has not been performed as part of the local implementation work. Deployment requires explicit approval.

From the `spartan-g` repository root, the intended limited deployment commands are:

```text
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase deploy --only functions
```

Review the Firebase project and active account before running any deployment command. Do not deploy unrelated resources.

After deployment, test rules and callable Functions using a real approved Super Admin and non-admin test accounts. Do not print or expose service-account credentials.

## Live Data Policy

Do not create production resource content during setup. If the `resources` collection is absent, create the first resource through the approved Super Admin UI after deployment and provisioning have been separately approved.

The read-only live audit script is:

```text
scripts/audit-firebase.mjs
```

It reports Auth users, custom claims, Firestore role counts, relevant collection counts, and sample metadata without writing data.
