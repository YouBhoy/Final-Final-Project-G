# Phase 4B — Facilitator Risk Dashboard: Pre-Implementation Audit

## 1. Risk Alerts Page

**Status: ❌ Does Not Exist (PlaceholderPage)**

| Component | Status | Details |
|-----------|--------|---------|
| Route `/facilitator/risk-alerts` | ❌ Missing | Not defined in `FacilitatorPortalRoutes.tsx`. Only 7 routes: dashboard, students, assessments, referrals, appointments, resources, profile |
| Sidebar nav item | ❌ Missing | `navConfigs.ts` facilitator items: Dashboard, Students, Assessments, Referrals, Appointments, Resources, Profile — no Risk Alerts |
| Actual page component | ❌ Missing | No `FacilitatorRiskAlertsPage.tsx` exists under `pages/facilitator/` |
| Real-time subscription | ❌ Missing | `riskAlertService.subscribeToAlerts()` exists but is never called from any UI |
| Firestore query for alerts | ✅ In service | `riskAlertRepository.getByFacilitator()` and `getOpenByFacilitator()` exist, both ordered by `createdAt` desc |
| Alert count badge on nav | ❌ Missing | No notification indicator at all |

## 2. Risk Alert Workflow

| Action | Service | Repository | UI | Status |
|--------|---------|------------|----|--------|
| View alerts | `getAlertsForFacilitator()` | `getByFacilitator()` | ❌ No page | ✅ Backend, ❌ Frontend |
| View open alerts | `getOpenAlerts()` | `getOpenByFacilitator()` | ❌ No page | ✅ Backend, ❌ Frontend |
| Acknowledge alert | `acknowledgeAlert()` | Updates status → `'acknowledged'` | ❌ No button | ✅ Backend, ❌ Frontend |
| Resolve alert | `resolveAlert()` | Updates status → `'resolved'` | ❌ No button | ✅ Backend, ❌ Frontend |
| Create alert (auto) | `createAlert()` (Phase 4A) | `riskAlertRepository.create()` | N/A (server-side) | ✅ New in Phase 4A |
| Sort/filter UI | ❌ None | Repository only supports `getByFacilitator` and `getOpenByFacilitator` | ❌ None | ❌ Missing |

**Missing pieces**: Entire alert list UI, acknowledge button, resolve button, status indicators, severity badges, empty state.

## 3. Severity Filtering

| Filter | Repository | Service | UI | Status |
|--------|-----------|---------|----|--------|
| All | ✅ `getByFacilitator()` | ✅ `getAlertsForFacilitator()` | ❌ No | ✅ Backend |
| Open | ✅ `getOpenByFacilitator()` | ✅ `getOpenAlerts()` | ❌ No | ✅ Backend |
| Acknowledged | ❌ No query | ❌ No service method | ❌ No | ❌ Missing |
| Resolved | ❌ No query | ❌ No service method | ❌ No | ❌ Missing |
| Low/Moderate/High/Critical | ❌ No query by severity | ❌ No service method | ❌ No | ❌ Missing |

**Client-side filtering** is the simplest approach — fetch all, filter in-memory by severity and status. This avoids composite indexes and extra Firestore queries. The number of alerts per facilitator will be low enough for this.

## 4. Student Timeline

**Current state**: `FacilitatorStudentsPage.tsx` has a "View Scores" mode that shows:

✅ Assessment history (all attempts with PHQ-9/GAD-7/DASS-21 scores)
✅ Overall risk level (from Phase 4A metadata)
✅ Risk flags (from Phase 4A metadata)
⚠️ No appointment history shown
⚠️ No messages shown
⚠️ No submissions shown
⚠️ No chronological timeline view

The student detail view in `FacilitatorStudentsPage` already shows attempts and scores using `AttemptScorePanel` and `ScoreCard` components.

**Minimal architecture**: Extend the existing "scores view" in `FacilitatorStudentsPage` to include:
- A risk alert section (show alerts for this student)
- An appointment section (show past appointments)
Both can reuse data already available through existing services.

## 5. Existing Infrastructure

| Infrastructure | Exists? | Details |
|----------------|---------|---------|
| `RiskAlertRepository` | ✅ | CRUD + `getByFacilitator()` + `getOpenByFacilitator()` |
| `RiskAlertService` | ✅ | CRUD + `createAlert()` (Phase 4A), `acknowledgeAlert()`, `resolveAlert()`, `subscribeToAlerts()` |
| `risk_alerts` collection | ✅ | In Firestore rules |
| `assessmentAttemptRepository` | ✅ | `getAttemptsForStudent()`, `getInProgressAttempt()` |
| Assessment risk metadata | ✅ | New in Phase 4A: `overallRiskLevel`, `overallRiskScore`, `riskFlags` on attempts |
| Domain scores | ✅ | via `evaluateAssessmentRisk()` or recalculated from stored answers |
| Student lookup | ✅ | `userRepository.getAllStudents()` |
| `appointmentRepository` | ✅ | `getByFacilitator()`, `getUpcomingByFacilitator()` ⚠️ No `getByStudent()` method |
| `appointmentService` | ✅ | Facilitator-facing only |
| Alert timeline queries | ⚠️ Partial | No `getByStudent()` method on risk alert repository |

**Gap**: No way to query risk alerts for a specific student or appointments for a specific student.

## 6. Minimal Architecture — Phase 4B

### Principle
- No new services
- No new repositories
- Extend 2 existing repositories with 1 method each
- One new page component
- Client-side filtering only

### Design

```
New Route: /facilitator/risk-alerts
    │
    ├── FacilitatorRiskAlertsPage.tsx (NEW)
    │   ├── Filter bar (client-side): All | Open | Acknowledged | Resolved | Low | Moderate | High | Critical
    │   ├── Alerts table: Student (pseudonymized), Severity badge, Title, Status, Date, Actions
    │   │   ├── ⚠️ High/Critical → always show real name
    │   │   ├── Acknowledge button → riskAlertService.acknowledgeAlert()
    │   │   └── Resolve button → riskAlertService.resolveAlert()
    │   └── Empty state / Spinner
    │
    └── Student Detail Deep Link: /facilitator/students/:studentId (EXTEND existing)
        ├── Existing: assessment attempts with scores
        ├── NEW: risk alerts for this student
        └── NEW: appointment history for this student
```

### Repository extensions needed (2 methods total)

1. `RiskAlertRepository.getByStudent(studentId: string)` — filter `risk_alerts` by `studentId`
2. `AppointmentRepository.getByStudent(studentId: string)` — filter `appointments` by `studentId`

## 7. Deliverables — Phase 4B

### New Files (1)

| File | Content | Est. LOC |
|------|---------|----------|
| `apps/web/src/pages/facilitator/FacilitatorRiskAlertsPage.tsx` | Alert list table, filter bar, acknowledge/resolve buttons, severity badges, pseudonymized names | +250 |

### Modified Files (4)

| File | Change | Est. LOC |
|------|--------|----------|
| `packages/shared-services/src/repositories/risk-alert.repository.ts` | Add `getByStudent()` method | +5 |
| `packages/shared-services/src/repositories/appointment.repository.ts` | Add `getByStudent()` method | +5 |
| `apps/web/src/navigation/navConfigs.ts` | Add "Risk Alerts" nav item to `facilitatorNavItems` | +2 |
| `apps/web/src/navigation/FacilitatorPortalRoutes.tsx` | Add route for `/risk-alerts` | +4 |

### Estimated Total: ~266 LOC

### Firestore Changes
- **Rules**: None needed (existing rules already cover `risk_alerts` and `appointments`)
- **Indexes**: None needed (single-field queries)

### Student Timeline Extension (optional, future phase)
- Extend `FacilitatorStudentsPage.tsx` to include risk alerts and appointments in the scores view
- Can be done without new services by calling existing service methods

### Testing Checklist
- [ ] Risk alerts page renders with data from `riskAlertService.getAlertsForFacilitator()`
- [ ] Severity badges display correctly (Low/Moderate/High/Critical)
- [ ] Pseudonymization works (real names shown only for High/Critical)
- [ ] Acknowledge button calls `riskAlertService.acknowledgeAlert()`
- [ ] Resolve button calls `riskAlertService.resolveAlert()`
- [ ] Client-side filtering by severity and status works
- [ ] Empty state shown when no alerts
- [ ] Error state shown when fetch fails
- [ ] Loading spinner during fetch

---

# Phase 4C — Student Assessment History: Pre-Implementation Audit

## 1. Assessment History

**Status: ❌ Students cannot view past attempts**

| Capability | Exists? | Details |
|------------|---------|---------|
| Student can start new assessment | ✅ `StudentAssessmentsPage.tsx` | Lists active templates, allows starting |
| Student can see published Phase 3B assessments | ✅ `AssessmentWizardPage.tsx` | Accessed via wizard flow |
| Student can see past submitted attempts | ❌ Missing | No page or component shows attempt history |
| Service method for student attempts | ✅ `assessmentService.getAttemptsByStudent()` | Exists, returns submitted/graded attempts sorted by date |
| Repository method for student attempts | ✅ `assessmentAttemptRepository` via `getAll()` | `getAttemptsForStudent()` requires assessmentId |
| Route for history page | ❌ Missing | No `/student/assessments/history` or similar |
| UI components for history | ❌ Missing | No list/table/timeline for past attempts |

**Key finding**: `assessmentService.getAttemptsByStudent(studentId)` already returns all submitted attempts with risk metadata. The data is available but no UI consumes it.

## 2. Trend Charts

**Status: ❌ No chart infrastructure exists**

| Component | Exists? | Details |
|-----------|---------|---------|
| Chart library installed | ❌ | Not in `apps/web/package.json`. No recharts, chart.js, d3, or any charting dep |
| Chart components | ❌ | No chart-related components anywhere |
| Timeline data preparation | ❌ | No hooks/services that prepare score-over-time data |
| Scoring history query | ⚠️ Partial | `assessmentService.getAttemptsByStudent()` returns all attempts — could be used for trends |

**Recommendation**: Use **simple SVG/CSS bar charts** or **HTML-based visualizations** first. Avoid introducing a chart library until trend lines are actually needed. A simple horizontal bar chart for the latest scores comparison (PHQ-9 vs GAD-7 vs DASS-21) can be done with Tailwind widths and colored bars.

If trend lines over time are needed later, `recharts` is the lightest dependency (no peer deps) and works well with React.

## 3. Risk History

**Status: ❌ Students cannot view risk history**

| Data | Available? | Student Can View? |
|------|-----------|-------------------|
| `overallRiskLevel` per attempt | ✅ (Phase 4A) | ❌ No UI |
| `overallRiskScore` per attempt | ✅ (Phase 4A) | ❌ No UI |
| `riskFlags` per attempt | ✅ (Phase 4A) | ❌ No UI |
| Historical progression | ✅ Can derive from `getAttemptsByStudent()` sorted by date | ❌ No UI |
| PHQ-9/GAD-7/DASS-21 scores per attempt | ✅ Can calculate from stored answers | ❌ No UI |

**Gap**: Student sees zero data about their own assessments after submission. The only UI is the "Assessment Submitted" success screen.

## 4. Appointment History

**Status: ❌ Student appointments page is PlaceholderPage**

| Capability | Exists? | Details |
|------------|---------|---------|
| Student appointment route | ⚠️ Placeholder | `/student/appointments` → `PlaceholderPage` |
| Student appointment service | ❌ Missing | `appointmentService` only has facilitator-facing methods |
| Student appointment repository methods | ❌ Missing | `appointmentRepository` only has `getByFacilitator()` and `getUpcomingByFacilitator()` |
| Appointment status filtering | ✅ Schema supports it | `AppointmentDocument.status`: scheduled / completed / cancelled |
| Completed appointments query | ❌ Missing | No `getByStudent()` or `getCompletedByStudent()` |

**Gap**: Neither the repository nor service supports student-facing queries. Students cannot see past, upcoming, or cancelled appointments.

## 5. Existing Reusable Components

| Component | Reusable? | Usage |
|-----------|-----------|-------|
| `Card` | ✅ | For attempt history items, appointment cards |
| `Badge` | ✅ | For severity, status, score badges |
| `Button` | ✅ | For actions (view attempt, reschedule) |
| `Select` | ✅ | For filtering by status or assessment |
| `Modal` | ✅ | For detail views |
| `EmptyState` | ✅ | When no history exists |
| `Spinner` | ✅ | Loading states |
| `AttemptScorePanel` | ⚠️ Used in facilitator's `FacilitatorStudentsPage` | Could be extracted to shared component for reuse |
| Timeline component | ❌ | Does not exist — would need creation |
| Chart component | ❌ | Does not exist — see trend chart recommendation |

## 6. Minimal Architecture — Phase 4C

### Principle
- One new page
- One new service method (student-facing appointment queries)
- One new repository method
- No chart library — use Tailwind bars
- Reuse `AttemptScorePanel`-style rendering from facilitator page

### Design

```
New Route: /student/assessments (existing) → add History tab/section
    │
    └── AssessmentHistoryPage.tsx (NEW)
        ├── "My Assessments" tab (existing: browse available)
        ├── "History" tab (NEW)
        │   ├── List of past attempts (sorted by date desc)
        │   │   ├── Assessment title, date submitted, status
        │   │   ├── Risk level badge (low/moderate/high/critical)
        │   │   ├── PHQ-9/GAD-7/DASS-21 scores (simple Tailwind bars)
        │   │   └── View details → modal with full score breakdown
        │   └── Empty state when no history
        │
        └── StudentAppointmentsPage.tsx (or extend student routes)
            ├── Upcoming appointments
            ├── Past appointments
            └── Cancelled appointments
```

### Score display (no chart library)
Use Tailwind width bars for a simple visual:
```
PHQ-9  ████████████░░░░░░░  12/27  Moderate
GAD-7  ██████░░░░░░░░░░░░░  6/21   Mild
DASS   ██████████████░░░░░  18/42  Moderate
```
This requires no library — just `w-{percentage}%` classes and colored divs.

## 7. Deliverables — Phase 4C

### New Files (1-2)

| File | Content | Est. LOC |
|------|---------|----------|
| `apps/web/src/pages/student/StudentAssessmentHistoryPage.tsx` | History list of past attempts, score display using Tailwind bars, detail modal, empty state | +250 |
| OR extend existing `StudentAssessmentsPage.tsx` | Add "History" section below available assessments | +150 |

### Modified Files (4)

| File | Change | Est. LOC |
|------|--------|----------|
| `packages/shared-services/src/repositories/appointment.repository.ts` | Add `getByStudent()` method | +5 |
| `packages/shared-services/src/services/appointment.service.ts` | Add `getStudentAppointments()` method | +10 |
| `apps/web/src/navigation/StudentPortalRoutes.tsx` | Add route for history page | +4 |
| `apps/web/src/navigation/navConfigs.ts` | Possibly update student nav items | +0-2 |

### Estimated Total: ~200 LOC

### Firestore Changes
- **Rules**: Add `allow read: if isStudent() && resource.data.studentId == request.auth.uid` for `appointments` collection (currently facilitator-only)
- **Indexes**: None needed (single-field query on `studentId`)

### Testing Checklist
- [ ] Student can view list of past assessment attempts
- [ ] Each attempt shows: date, status, risk level badge
- [ ] Score display works (Tailwind bars)
- [ ] Empty state shows when no attempts exist
- [ ] Detail modal shows full score breakdown
- [ ] Loading spinner during data fetch
- [ ] Error state on fetch failure

---

## Combined Summary

| Phase | New Files | Modified Files | Est. LOC | Firestore Rules Changes | Indexes Needed |
|-------|-----------|----------------|----------|------------------------|----------------|
| 4B — Facilitator Risk Dashboard | 1 | 4 | ~266 | None | None |
| 4C — Student Assessment History | 1 | 4 | ~200 | ✅ Appointments collection | None |
| **Total** | **2** | **8** | **~466** | **1 rule change** | **None** |

Both can be implemented independently in any order.