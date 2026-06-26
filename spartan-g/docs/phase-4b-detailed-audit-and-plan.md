# Phase 4B — Facilitator Risk Dashboard: Detailed Audit & Implementation Plan

## Executive Summary

The Facilitator Risk Dashboard requires building one new page (`FacilitatorRiskAlertsPage`), extending two repositories with one method each, adding one nav item, and adding one route. No new services, no new collections, no Firestore rule changes, no new indexes. Estimated **~266 LOC**. Estimated development time: **1 session**.

---

## 1. Risk Alert Infrastructure — Complete Audit

### RiskAlertDocument (firestore.types.ts lines 67–79)

```typescript
{
  studentId: string;              // ✅
  facilitatorId: string;          // ✅
  severity: 'low'|'medium'|'high'|'critical';  // ✅
  title: string;                  // ✅
  description: string;            // ✅
  status: 'open'|'acknowledged'|'resolved';     // ✅
  assessmentAttemptId?: string;   // ✅ (Phase 4A)
  overallRiskScore?: number;      // ✅ (Phase 4A)
  riskFlags?: {type, label, severity}[]; // ✅ (Phase 4A)
  createdAt?: Timestamp;          // ✅ (via BaseRepository)
  updatedAt?: Timestamp;          // ✅ (via BaseRepository)
}
```

**What already works:**
- All document fields exist
- `createdAt`/`updatedAt` are auto-set by `BaseRepository`

**What is missing:**
- No `resolvedAt` or `acknowledgedAt` timestamp (not critical, can use `updatedAt`)
- No `resolvedBy` or `acknowledgedBy` field (not required for MVP)

### RiskAlertRepository (risk-alert.repository.ts, 26 lines)

```typescript
getByFacilitator(facilitatorId)        // ✅ ordered by createdAt desc
getOpenByFacilitator(facilitatorId)    // ✅ ordered by createdAt desc
// Missing:
getByStudent(studentId)                // ❌ needed for student timeline
```

**What already works:**
- Inherits full CRUD from `BaseRepository` (`getById`, `getAll`, `create`, `update`, `delete`)
- `getByFacilitator()` and `getOpenByFacilitator()` both use the existing composite index on `risk_alerts`

**What is missing:**
- `getByStudent()` — single-field query on `studentId`, no index needed

### RiskAlertService (risk-alert.service.ts, 50 lines)

```typescript
getAlertsForFacilitator(facilitatorId, actorRole)   // ✅
getOpenAlerts(facilitatorId, actorRole)              // ✅
acknowledgeAlert(alertId, actorRole)                 // ✅ sets status → 'acknowledged'
resolveAlert(alertId, actorRole)                     // ✅ sets status → 'resolved'
createAlert({studentId, facilitatorId, assessmentAttemptId, evaluation}) // ✅ (Phase 4A)
subscribeToAlerts(facilitatorId, actorRole, callback) // ✅ real-time subscription
```

**All methods work. No new service methods needed.** The page will call existing service methods.

### Firestore Rules (firestore.rules lines 132–137)

```
match /risk_alerts/{alertId} {
  allow read: if isFacilitatorOrAdmin()
    || (isStudent() && resource.data.studentId == request.auth.uid);
  allow create, update: if isFacilitatorOrAdmin();
  allow delete: if isSuperAdmin();
}
```

**Rules already allow:**
- Facilitators can read all risk alerts
- Facilitators can update (acknowledge/resolve)
- Students can read their own alerts

**No rule changes needed.**

### Firestore Indexes (firestore.indexes.json lines 53–59)

```
risk_alerts: facilitatorId ↑, status ↑, createdAt ↓
```

**Existing index supports `getByFacilitator()` and `getOpenByFacilitator()`.**

**No new indexes needed.** Queries by `studentId` are single-field (no composite index required). Client-side filtering by severity/status avoids need for composite queries.

---

## 2. Facilitator Dashboard — Page-by-Page Audit

| Route | Page | Status |
|-------|------|--------|
| `/facilitator/dashboard` | `PlaceholderPage` | ❌ Placeholder |
| `/facilitator/students` | `FacilitatorStudentsPage` | ✅ Implemented |
| `/facilitator/students/:id` | Not defined | ❌ Missing |
| `/facilitator/assessments` | `FacilitatorAssessmentsPage` | ✅ Implemented |
| `/facilitator/risk-alerts` | Not defined | ❌ Missing |
| `/facilitator/referrals` | `PlaceholderPage` | ❌ Placeholder |
| `/facilitator/appointments` | `PlaceholderPage` | ❌ Placeholder |
| `/facilitator/resources` | `PlaceholderPage` | ❌ Placeholder |
| `/facilitator/profile` | `PlaceholderPage` | ❌ Placeholder |

**Key finding:** No Risk Alerts route, no Risk Alerts nav item, no Risk Alerts page. The only route change needed is adding the new page.

---

## 3. Assessment Data — Post-Phase 4A Audit

After Phase 4A, every submitted `AssessmentAttemptDocument` contains:

| Field | Persisted? | Source |
|-------|-----------|--------|
| `overallRiskScore` | ✅ | `evaluateAssessmentRisk().overallRiskScore` |
| `overallRiskLevel` | ✅ | `evaluateAssessmentRisk().overallRiskLevel` |
| `riskFlags` | ✅ | `evaluateAssessmentRisk().riskFlags` |
| `submittedAt` | ✅ | Set during `submitAttempt()` |
| `assessmentId` | ✅ | Original document field |
| `studentId` | ✅ | Original document field |
| `answers` | ✅ | Original document field |
| `attemptNumber` | ✅ | Original document field |

**All risk metadata is available.** Domain scores (PHQ-9/GAD-7/DASS-21) can be recalculated from `answers` using `evaluateAssessmentRisk()` if needed, or fetched from the document's stored `riskFlags`.

---

## 4. Student Lookup — Current Implementation

| Component | Method | Status |
|-----------|--------|--------|
| Repository | `userRepository.getAllStudents()` | ✅ Returns active students sorted by displayName |
| Service | (direct repository call in `FacilitatorStudentsPage`) | ✅ Used directly |
| Query | `where('role', '==', 'student')` + `where('isActive', '==', true)` | ✅ |
| In-page student data | `FacilitatorStudentsPage` | ✅ Loads all students on mount |

**How facilitator currently loads students:**
```typescript
// FacilitatorStudentsPage.tsx line 252
const result = await userRepository.getAllStudents();
```

**Can student information be loaded from assessment attempts?**
- `assessmentService.getAttemptsByStudent(studentId)` returns attempts with `studentId`
- But this requires already knowing the `studentId`
- For the risk alerts page, alerts already contain `studentId` — no separate student lookup needed

**Additional repository needed?** No. The risk alerts already carry `studentId` and risk metadata. Student display names can be loaded from a single `userRepository.getById(studentId)` call per unique student, or batched.

---

## 5. Existing Reusable Components — Full Inventory

| Component | File | Reuse Plan |
|-----------|------|------------|
| `Card` | `ui/Card.tsx` | ✅ Wrap alert list, wrap detail panel |
| `CardBody` | `ui/Card.tsx` | ✅ Inner content wrapper |
| `Badge` | `ui/Badge.tsx` | ✅ Severity badges (`danger`/`warning`/`info`/`neutral`) |
| `Badge variant="danger"` | `ui/Badge.tsx` | Critical severity |
| `Badge variant="warning"` | `ui/Badge.tsx` | High severity |
| `Badge variant="info"` | `ui/Badge.tsx` | Moderate severity |
| `Badge variant="neutral"` | `ui/Badge.tsx` | Low severity |
| `Badge variant="success"` | `ui/Badge.tsx` | Resolved status |
| `Button` | `ui/Button.tsx` | ✅ Acknowledge, Resolve actions |
| `Button variant="outline"` | `ui/Button.tsx` | Secondary actions |
| `Spinner` | `ui/Spinner.tsx` | ✅ Loading state |
| `EmptyState` | `ui/EmptyState.tsx` | ✅ No alerts state |
| `Modal` | `ui/Modal.tsx` | ✅ Alert detail view |
| `Select` | `ui/Select.tsx` | ✅ Filter dropdown |
| `Table` (HTML `<table>`) | Used in `FacilitatorAssessmentsPage` | ✅ Pattern to follow for alert list |
| `AttemptScorePanel` | `FacilitatorStudentsPage.tsx` | ⚠️ Internal component, can refactor to shared later |
| `ScoreCard` | `FacilitatorStudentsPage.tsx` | ⚠️ Internal component |
| Pseudonymization pattern | `FacilitatorStudentsPage.tsx` | ✅ `getPseudonym()`, `getHiddenEmail()` — reusable pattern |
| Timeline component | ❌ Does not exist | Not needed for Phase 4B MVP |

**No new UI components need to be created.** The alert table can follow the same pattern as `FacilitatorAssessmentsPage.tsx` (simple `<table>` with Tailwind).

---

## 6. Alert Workflow — Lifecycle Audit

### Current State Machine

```
[open] ──acknowledge()──→ [acknowledged] ──resolve()──→ [resolved]
                                              ↺           [no reopen]
```

**State values:** `'open'` | `'acknowledged'` | `'resolved'`

**Who can:**
- **Acknowledge:** Facilitator/Admin via `riskAlertService.acknowledgeAlert()` → sets `status: 'acknowledged'`
- **Resolve:** Facilitator/Admin via `riskAlertService.resolveAlert()` → sets `status: 'resolved'`
- **Reopen:** ❌ Not supported — no `reopenAlert()` method exists
- **Auto-create:** ✅ Phase 4A `riskAlertService.createAlert()` → sets `status: 'open'`

**Timestamps stored:**
- `createdAt` ✅ via `BaseRepository.create()` (serverTimestamp)
- `updatedAt` ✅ via `BaseRepository.create()` and `BaseRepository.update()` (serverTimestamp)
- `acknowledgedAt` ❌ Not stored (but `updatedAt` changes on acknowledge)
- `resolvedAt` ❌ Not stored (but `updatedAt` changes on resolve)

**Audit fields stored:**
- `acknowledgedBy` ❌ Not stored
- `resolvedBy` ❌ Not stored

**Workflow already implemented:**
- ✅ Backend: acknowledgeAlert(), resolveAlert()
- ❌ Frontend: No buttons exist yet

---

## 7. Timeline Capability — Data Audit

To build a chronological timeline combining assessments + appointments + risk alerts:

| Data Type | Has Date? | Has StudentId? | Queryable by Student? | Currently Shown? |
|-----------|-----------|----------------|----------------------|-------------------|
| Assessment Attempts | ✅ `submittedAt` | ✅ | `assessmentService.getAttemptsByStudent()` | ✅ In scores view |
| Risk Alerts | ✅ `createdAt` | ✅ | ❌ No `getByStudent()` | ❌ |
| Appointments | ✅ `scheduledAt` | ✅ | ❌ No `getByStudent()` | ❌ |

**What's missing for a full timeline:**
1. `RiskAlertRepository.getByStudent()` — add 1 method
2. `AppointmentRepository.getByStudent()` — add 1 method

**With those two methods, a student timeline combining all three data types is fully achievable.** The timeline is not required for Phase 4B MVP but the repository methods would serve both Phase 4B (student detail) and Phase 4C (student history).

---

## 8. Firestore — Required Changes

### Indexes
- **No new indexes required.**
- `riskAlertsRepository.getByFacilitator()` uses existing composite index on `facilitatorId ↑, status ↑, createdAt ↓`
- `risk_alerts` queries by `studentId` are single-field (Firestore auto-indexes)
- `appointments` queries by `studentId` are single-field

### Rules
- **No rule changes required for Phase 4B.**
- Facilitators already have read access to `risk_alerts` and `appointments`
- Facilitators already have update access (`isFacilitatorOrAdmin()` allows update)

### Collections
- **No new collections required.**
- `risk_alerts` collection already exists in rules
- `appointments` collection already exists in rules

---

## Phase 4B Checklist

- [x] RiskAlertDocument fields (already complete)
- [x] RiskAlertRepository methods (backend complete)
- [x] RiskAlertService methods (backend complete)
- [x] Firestore rules (already permissive for facilitators)
- [x] Firestore indexes (existing composite index sufficient)
- [ ] Risk Alerts page (new)
- [ ] Severity filter (client-side)
- [ ] Status filter (client-side)
- [ ] Alert acknowledge button
- [ ] Alert resolve button
- [ ] Pseudonymized student names
- [ ] Empty state
- [ ] Loading state
- [ ] Error handling
- [ ] Sidebar nav item
- [ ] Route registration

---

## Implementation Plan

### Files to Create (1)

| File | Purpose |
|------|---------|
| `apps/web/src/pages/facilitator/FacilitatorRiskAlertsPage.tsx` | Full alert list page with filters, table, actions |

### Files to Modify (4)

| File | Change |
|------|--------|
| `packages/shared-services/src/repositories/risk-alert.repository.ts` | Add `getByStudent(studentId)` method (+5 lines) |
| `packages/shared-services/src/repositories/appointment.repository.ts` | Add `getByStudent(studentId)` method (+5 lines) |
| `apps/web/src/navigation/navConfigs.ts` | Add "Risk Alerts" nav item with icon to `facilitatorNavItems` (+2 lines) |
| `apps/web/src/navigation/FacilitatorPortalRoutes.tsx` | Add import + `<Route path="risk-alerts" element={...} />` (+4 lines) |

### Estimated LOC: ~266

| Component | Est. Lines |
|-----------|-----------|
| `FacilitatorRiskAlertsPage.tsx` | ~250 |
| `risk-alert.repository.ts` (addition) | +5 |
| `appointment.repository.ts` (addition) | +5 |
| `navConfigs.ts` (addition) | +2 |
| `FacilitatorPortalRoutes.tsx` (addition) | +4 |
| **Total** | **~266** |

### Repositories Reused
- `riskAlertRepository` — `getAlertsForFacilitator()`, `acknowledgeAlert()`, `resolveAlert()`
- `userRepository` — `getById()` for student display names

### Services Reused
- `riskAlertService` — all methods called directly
- No new service methods needed

### New Services Required
- **None**

### Firestore Changes Required
- **None**

### Security Rule Changes Required
- **None**

### Indexes Required
- **None**

### Estimated Development Time: ~3–4 hours**

---

## Risk Alert Page Design (for reference, not implementation)

```
┌─────────────────────────────────────────────────────────┐
│  Risk Alerts                          [Filter: All ▼]  │
│  Monitor and manage student risk alerts                │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐ │
│  │ Severity  │ Student    │ Alert              │ Status   │ Actions      │ │
│  ├───────────────────────────────────────────────────┤ │
│  │ ⚠ Critical │ Student A  │ Severe Depression │ Open     │ [Ack] [Res] │ │
│  │ ⚠ High     │ Student B  │ Moderate Anxiety  │ Open     │ [Ack] [Res] │ │
│  │ ⚡ Moderate│ Student C  │ Multiple Domains  │ Ack'd    │ [Res]       │ │
│  │ ⚪ Low     │ Student D  │ Mild Depression   │ Resolved │ —           │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Key behavior:**
- Student names are pseudonymized unless severity is High or Critical
- "Acknowledge" button → calls `riskAlertService.acknowledgeAlert(alertId)`
- "Resolve" button → calls `riskAlertService.resolveAlert(alertId)`
- Filter bar: All | Open | Acknowledged | Resolved | Critical | High | Moderate | Low
- Filters applied client-side for simplicity