# SPARTAN-G

Multi-platform mental health and learning platform for student support — React Native (Expo) + React Web + Firebase.

---

## Table of Contents

- [Monorepo Layout](#monorepo-layout)
- [Quick Start](#quick-start)
- [System Architecture](#system-architecture)
- [Roles & Permissions](#roles--permissions)
- [Firestore Security Rules](#firestore-security-rules)
- [Features by Role](#features-by-role)
- [Assessment System](#assessment-system)
- [Data Flow](#data-flow)

---

## Monorepo Layout

```
spartan-g/
├── apps/
│   ├── mobile/              # Expo — Student + Facilitator
│   └── web/                 # Vite React — all web portals
├── packages/
│   ├── shared-types/        # Types, schemas, RBAC, permissions
│   ├── shared-services/     # Firebase repos, services, store
│   └── shared-ui/           # Theme tokens, role guards
├── firebase/
│   ├── firestore.rules      # Security rules (server-enforced)
│   └── firestore.indexes.json
└── .env                     # Firebase credentials
```

### Platforms

| Platform | URL | Command |
|----------|-----|---------|
| Student Web | `localhost:5173/student/*` | `npm run web` |
| Facilitator Web | `localhost:5173/facilitator/*` | `npm run web` |
| Super Admin Web | `localhost:5173/admin/*` | `npm run web` |
| Dev Seeder | `localhost:5173/dev/seed` | (use to seed test data) |

---

## Quick Start

```bash
cd spartan-g
npm install
# Fill in apps/web/.env with Firebase credentials
npm run web
```

---

## System Architecture

The system uses a **3-layer security model**:

```
┌─────────────────────────────────────────────┐
│  Frontend (React)                           │
│  - Route guards (ProtectedRoute)            │
│  - Service-level permission checks          │
│  - UI rendering based on role               │
├─────────────────────────────────────────────┤
│  Service Layer (shared-services)            │
│  - hasPermission() checks                   │
│  - Repository pattern for Firestore ops     │
├─────────────────────────────────────────────┤
│  Firestore Security Rules (server-enforced) │
│  - Validates user role from users/{uid}     │
│  - Checks document-level conditions         │
│  - Cannot be bypassed from client code      │
└─────────────────────────────────────────────┘
```

**Key principle**: Even if a user bypasses the frontend, Firestore security rules still block unauthorized access at the database level.

---

## Roles & Permissions

### Three Roles

| Role | Description | Hierarchy |
|------|-------------|-----------|
| **Student** | Can take assessments, view courses, manage own profile | Level 1 |
| **Facilitator** | Can manage students, view assessment data, create content | Level 2 |
| **Super Admin** | Full system access, creates assessments, manages all users | Level 3 |

### Permission Matrix

| Permission | Student | Facilitator | Super Admin |
|-----------|:-------:|:-----------:|:-----------:|
| **Profile** | | | |
| View own profile | ✅ | ✅ | ✅ |
| Edit own profile | ✅ | ✅ | ✅ |
| **Courses** | | | |
| View published courses | ✅ | ✅ | ✅ |
| Create/edit/delete courses | ❌ | ✅ | ✅ |
| Enroll in courses | ✅ | ❌ | ❌ |
| **Students** | | | |
| View enrolled students | ❌ | ✅ | ✅ |
| Manage student accounts | ❌ | ✅ | ✅ |
| **Assignments** | | | |
| Submit assignments | ✅ | ❌ | ❌ |
| Grade assignments | ❌ | ✅ | ✅ |
| Create assignments | ❌ | ✅ | ✅ |
| **Assessments** | | | |
| View assessment templates | ✅ (active only) | ✅ | ✅ |
| Manage assessment templates | ❌ | ✅ | ✅ |
| View assessment definitions (Phase 3B) | ✅ (published only) | ✅ | ✅ |
| Create assessment definitions | ❌ | ❌ | ✅ only |
| Take assessments | ✅ | ❌ | ✅ |
| View student assessment attempts | ❌ | ✅ | ✅ |
| **Risk Alerts** | | | |
| View risk alerts | ❌ | ✅ | ✅ |
| Create risk alerts | ❌ | ✅ | ✅ |
| **Appointments** | | | |
| View own appointments | ✅ | ✅ | ✅ |
| Manage appointments | ❌ | ✅ | ✅ |
| **Messaging** | | | |
| Send/receive messages | ✅ | ✅ | ✅ |
| **Notifications** | | | |
| Read/update own notifications | ✅ | ✅ | ✅ |
| Create notifications | ❌ | ✅ | ✅ |
| **Audit Logs** | | | |
| View audit logs | ❌ | ❌ | ✅ only |
| **System** | | | |
| Manage users & roles | ❌ | ❌ | ✅ only |
| Platform settings | ❌ | ❌ | ✅ only |

### How Permissions Are Enforced

**Frontend** (`shared-types/src/constants/permissions.ts`):
```typescript
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [ROLES.STUDENT]: [VIEW_OWN_PROFILE, VIEW_COURSES, TAKE_ASSESSMENTS, ...],
  [ROLES.FACILITATOR]: [MANAGE_STUDENTS, GRADE_ASSIGNMENTS, ...],
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS), // everything
};
```

**Service layer** (`shared-services/src/services/`):
```typescript
if (!hasPermission(actorRole, PERMISSIONS.VIEW_ASSESSMENTS)) {
  throw new PermissionError();
}
```

**Firestore rules** (`firebase/firestore.rules`):
```javascript
function isStudent() {
  return isActiveUser() && userRole() == 'student';
}
// Rules check the user's document in the 'users' collection
// for their role and isActive status
```

---

## Firestore Security Rules

### Helper Functions (evaluated server-side)

```
isAuthenticated()  → User is logged in
isActiveUser()     → User is logged in AND users/{uid}.isActive == true
isStudent()        → isActiveUser() AND role == 'student'
isFacilitator()    → isActiveUser() AND role == 'facilitator'
isSuperAdmin()     → isActiveUser() AND role == 'super_admin'
isFacilitatorOrAdmin()  → isFacilitator() OR isSuperAdmin()
```

### Collection-Level Access Rules

| Collection | Student | Facilitator | Super Admin |
|-----------|---------|-------------|-------------|
| `users` | Read own only | Read all | Read all, manage all |
| `profiles` | Read/write own | Read all | Full access |
| `courses` | Read published only | Full CRUD | Full CRUD |
| `enrollments` | Read/write own | Read all | Full CRUD |
| `assignments` | Read only | Full CRUD | Full CRUD |
| `submissions` | Read/write own | Read all | Full CRUD |
| `notifications` | Read/write own | Create notifications | Full CRUD |
| `announcements` | Read active/targeted | Full CRUD | Full CRUD |
| `audit_logs` | ❌ | Create only | Read + Create |
| `risk_alerts` | Read own | Full CRUD | Full CRUD + Delete |
| `appointments` | Read own | Full CRUD | Full CRUD |
| `conversations` | Read/write if participant | Read/write if participant | Full CRUD |
| `messages` | Read all, write own | Read all, write own | Full CRUD |
| `assessment_templates` | Read active only | Full CRUD | Full CRUD |
| `assessment_questions` | Read only | Full CRUD | Full CRUD |
| `assessments` (Phase 3A) | Read/write own attempts | Read all | Full CRUD |
| `assessments` (Phase 3B) | Read published definitions | Read all | Full CRUD |
| `assessment_attempts` | Read/write own | Read all | Full CRUD |
| `assessment_responses` | Read/write own | Read all | Full CRUD |

### Deploying Rules

```bash
cd spartan-g
npx firebase-tools deploy --only firestore:rules --project spartan-g-a2d80
```

---

## Features by Role

### Student Features
- **Dashboard** — Overview of courses, alerts, and upcoming sessions
- **Assessments** — Browse available assessments, choose sections (PHQ-9, GAD-7, DASS-21), answer questions, submit
- **Check-ins** — Periodic wellness check-in questionnaires
- **Resources** — Curated mental health resources
- **Appointments** — View scheduled appointments with facilitators
- **Profile** — View and edit own profile
- **Messages** — Communicate with facilitators

**Assessment Flow (Student)**:
1. View available assessments on `/student/assessments`
2. Click "Start" on an assessment
3. Choose a section (PHQ-9, GAD-7, or DASS-21)
4. Answer questions one by one with auto-save
5. Review section answers, click "Complete Section"
6. Repeat for other sections
7. Click "Review & Submit" when all sections are done
8. View confirmation

### Facilitator Features
- **Dashboard** — Overview of caseload, risk alerts, upcoming sessions
- **Students** — View enrolled students with risk indicators
- **Assessments** — View published assessment definitions and student responses (read-only)
- **Referrals** — Create and track referrals to specialist support
- **Appointments** — Schedule and review appointments with students
- **Resources** — Curate and share resources with students
- **Risk Alerts** — Monitor student wellness indicators
- **Messages** — Communicate with students
- **Work Hours** — Manage availability schedule

### Super Admin Features
- **Dashboard** — System-wide overview
- **Users** — Create, edit, deactivate user accounts; manage roles
- **Assessment Templates** — Create and manage Phase 3A assessment templates
- **Assessment Definitions** — Create Phase 3B course-based assessments (via `/dev/seed` or future UI)
- **Audit Logs** — View system activity logs
- **Platform Settings** — System configuration

---

## Assessment System

SPARTAN-G has two assessment phases:

### Phase 3A: Template-Based Assessments (Check-ins)

**Use case**: Facilitator-created wellness check-in questionnaires for students

| Concept | Collection | Description |
|---------|-----------|-------------|
| Template | `assessment_templates` | Assessment metadata (title, category, isActive) |
| Questions | `assessment_questions` | Individual questions linked to a template |
| Attempt | `assessments` | Student's attempt record (studentId, templateId, status) |
| Responses | `assessment_responses` | Individual student answers |

**Question Types**: short_text, long_text, single_choice, multi_choice, scale_1_5, scale_1_10, yes_no

**Flow**: Student browses templates → starts attempt → answers questions → submits

**Access Rules**:
- Students can only read their own attempt documents (`studentId == their uid`)
- Facilitators/admins can read all attempts
- Only facilitators/admins can create templates and questions

### Phase 3B: Course-Based Assessments (Mental Health Screenings)

**Use case**: Standardized clinical screening tools (PHQ-9, GAD-7, DASS-21)

| Concept | Collection | Description |
|---------|-----------|-------------|
| Definition | `assessments` | Assessment with questions embedded (courseId, facilitatorId, isPublished, questions[]) |
| Attempt | `assessment_attempts` | Student's attempt (assessmentId, studentId, answers[], status) |

**Question Types**: multiple_choice, true_false, short_answer

**Flow**: Super admin seeds assessment definition → Student selects sections → Answers questions → Submits

**Access Rules**:
- Students can read published assessment definitions (`isPublished == true`)
- Students can only read/write their own attempts
- Only super_admin can create assessment definitions
- Facilitators/admins can read all

**Sections**: The wizard groups questions by prefix:
- `phq1`–`phq9` → **PHQ-9** (Depression screening)
- `gad1`–`gad7` → **GAD-7** (Anxiety screening)
- `dass1`–`dass21` → **DASS-21** (Depression, Anxiety & Stress Scale)

Students choose which section to answer first, can complete them in any order, and can review before final submission.

---

## Data Flow

```
Registration
  │
  ▼
Firebase Auth ─── creates user document in 'users/{uid}'
                   with role: 'student', isActive: true
  │
  ▼
Login ─── reads 'users/{uid}' to get role
         role determines which portal/portal-layout renders
         role determines which sidebar nav items appear
         ProtectedRoute blocks access if role doesn't match
  │
  ▼
Feature Access
  │
  ├── Frontend: route guards + hasPermission() in services
  ├── Service: PermissionError thrown before Firestore call
  └── Firestore: security rules enforce at database level
```

### Key Files

| File | Purpose |
|------|---------|
| `packages/shared-types/src/constants/roles.ts` | Role definitions (student, facilitator, super_admin) |
| `packages/shared-types/src/constants/permissions.ts` | Permission matrix per role |
| `packages/shared-types/src/rbac/index.ts` | `hasPermission()` function |
| `apps/web/src/hooks/useAuth.tsx` | Auth context providing `user.role` |
| `apps/web/src/components/auth/ProtectedRoute.tsx` | Route guard component |
| `apps/web/src/navigation/navConfigs.ts` | Sidebar nav items per role |
| `apps/web/src/navigation/AppRouter.tsx` | Route definitions per portal |
| `firebase/firestore.rules` | Server-enforced access rules |
| `packages/shared-services/src/services/assessment.service.ts` | Assessment business logic |
| `packages/shared-services/src/repositories/base.repository.ts` | Base Firestore operations |