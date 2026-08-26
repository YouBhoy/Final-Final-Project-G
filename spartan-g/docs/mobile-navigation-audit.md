# Mobile Navigation Audit

> **Branch:** `app` @ `3b633d7` (*garden: simplify stat grid, minor assessment service update*)
> **Audited:** August 26, 2026 · **Scope:** `apps/mobile/src/navigation/*`

## Summary

| Metric | Count |
|---|---|
| Total registered routes | **29** |
| Real screens | **23** |
| Placeholder screens | **6** |

The mobile app is now **79% wired to real implementations** (23 of 29 routes). Only 6 routes still render `PlaceholderScreen`.

---

## Route Breakdown

### AuthNavigator — 3 routes (2 real / 1 placeholder)

| Route | Status | Implementation |
|---|---|---|
| Login | ✅ Real | `LoginScreen` (422 lines) |
| Register | ✅ Real | `RegisterScreen` (515 lines) |
| WebOnlyRedirect | ⬜ Placeholder | `PlaceholderScreen` |

*Note: `ForgotPassword` was removed upstream (`11714c0`).*

### StudentNavigator (tabs) — 6 routes (6 real / 0 placeholders)

| Route | Tab Label | Status | Implementation |
|---|---|---|---|
| StudentHome | Home | ✅ Real | `DashboardScreen` (903 lines, shared) |
| StudentCourses | Facilitators | ✅ Real | `FindFacilitatorScreen` (287 lines) |
| StudentAssignments | Assessments | ✅ Real | `AssessmentsListScreen` (450 lines) |
| StudentGarden | Garden | ✅ Real | `GardenScreen` (372 lines) |
| StudentMessages | Messages | ✅ Real | `MessagesScreen` (198 lines) |
| StudentProfile | Profile | ✅ Real | `StudentProfileScreen` (762 lines) |

### StudentNavigator (stack) — 6 routes (4 real / 2 placeholders)

| Route | Status | Implementation |
|---|---|---|
| CourseDetail | ⬜ Placeholder | `PlaceholderScreen` |
| AssignmentDetail | ⬜ Placeholder | `PlaceholderScreen` |
| ConversationDetail | ✅ Real | `ConversationDetailScreen` (216 lines) |
| AssessmentWizard | ✅ Real | `TemplateAssessmentScreen` (795 lines) |
| BookAppointment | ✅ Real | `BookAppointmentScreen` (487 lines) |
| StudentAppointments | ✅ Real | `StudentAppointmentsScreen` (209 lines) |

*(`StudentTabs` is the tab container and is not counted in totals.)*


### FacilitatorNavigator (tabs) — 6 routes (6 real / 0 placeholders)

| Route | Tab Label | Status | Implementation |
|---|---|---|---|
| FacilitatorDashboard | Home | ✅ Real | `DashboardScreen` (903 lines, shared) |
| Appointments | Appts | ✅ Real | `AppointmentsScreen` (383 lines) |
| Messaging | Chats | ✅ Real | `FacilitatorMessagesScreen` (196 lines) |
| WorkHoursSchedule | Hours | ✅ Real | `WorkHoursScreen` (315 lines) |
| AssessmentOverrides | Students | ✅ Real | `AssessmentOverrideListScreen` (322 lines) |
| FacilitatorProfile | Profile | ✅ Real | `FacilitatorProfileScreen` (404 lines) |

*Note: the old `RiskAlerts` tab was removed upstream (`43c4899`) and replaced by `AssessmentOverrides`.*

### FacilitatorNavigator (stack) — 8 routes (5 real / 3 placeholders)

| Route | Status | Implementation |
|---|---|---|
| FacilitatorAssessmentsList | ✅ Real | `FacilitatorAssessmentsScreen` (296 lines) |
| FacilitatorStudentsList | ✅ Real | `FacilitatorStudentsScreen` (1,029 lines) |
| FacilitatorSlotsList | ✅ Real | `SlotsScreen` (504 lines) |
| AppointmentDetail | ⬜ Placeholder | `PlaceholderScreen` |
| ConversationDetail | ✅ Real | `ConversationDetailScreen` (216 lines) |
| ManageCourse | ⬜ Placeholder | `PlaceholderScreen` |
| GradeSubmission | ⬜ Placeholder | `PlaceholderScreen` |
| StudentDetail | ✅ Real | `StudentDetailScreen` (1,287 lines) |

*(`FacilitatorTabs` is the tab container and is not counted in totals.)*

### Remaining Placeholders (6 total)

1. `WebOnlyRedirect` (Auth)
2. `CourseDetail` (Student stack)
3. `AssignmentDetail` (Student stack)
4. `AppointmentDetail` (Facilitator stack)
5. `ManageCourse` (Facilitator stack)
6. `GradeSubmission` (Facilitator stack)

---

## What To Do Next

### Priority 1 — Fix `linking.ts` (stale deep-link config)

`navigation/linking.ts` is out of sync with the navigators. Deep links — and notification-tap navigation handled in `RootNavigator` — will fail to resolve for these unregistered routes:

- `StudentGarden`, `AssessmentWizard`, `BookAppointment`, `StudentAppointments`
- `FacilitatorAssessmentsList`, `FacilitatorStudentsList`, `FacilitatorSlotsList`, `StudentDetail`

**Action:** Add path mappings for all 8 routes under their respective navigator blocks in `linking.ts`.

### Priority 2 — Implement the remaining placeholders

Suggested order (by user impact):

1. **`AppointmentDetail`** — facilitators can list appointments but cannot open one; blocks appointment management on mobile.
2. **`GradeSubmission`** — required for facilitators to grade submissions from the assessments flow.
3. **`ManageCourse`** — course management CRUD for facilitators.
4. **`CourseDetail`** — student-side course view.
5. **`AssignmentDetail`** — student assignment detail; may be partially superseded by `AssessmentWizard`.
6. **`WebOnlyRedirect`** — low priority; `RootNavigator` already renders `WebOnlyScreen` directly for web-only roles before any route is reached, so a full screen here is optional.

Reuse existing patterns: new screens belong in `screens/<portal>/`, consume services from `@spartan-g/shared-services`, and must be registered in both their navigator **and** `linking.ts`.

### Priority 3 — Housekeeping

- **Dead code:** `AssessmentWizardScreen.tsx` (550 lines) is no longer referenced by any navigator — the `AssessmentWizard` route now uses `TemplateAssessmentScreen`. Merge useful logic or delete the file.
- **Misleading labels:** `StudentCourses` renders a facilitator finder (tab reads "Facilitators"), and the "Students" tab renders `AssessmentOverrideListScreen`. Consider renaming route names/labels to match content.
- **Shared types:** update `MobileAuthStackParamList`, `StudentMobileStackParamList`, and `FacilitatorMobileStackParamList` in `@spartan-g/shared-types` so TypeScript params cover all newer routes.

### Environment Reminder

After resetting to this commit, run `npm install` at the repo root and inside `apps/mobile` before starting Expo — dependencies may differ from previously installed versions.

