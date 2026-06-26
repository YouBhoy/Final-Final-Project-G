# Phase 4A — Risk Detection Engine: Pre-Implementation Audit

## Step 1 — Audit Results

### 1. Where Assessment Submissions Are Finalized

Two entry points:

| Phase | Method | File | Line |
|-------|--------|------|------|
| **Phase 3B** (course-based) | `assessmentService.submitAttempt()` | `shared-services/src/services/assessment.service.ts` | **228–248** |
| **Phase 3A** (template-based) | `assessmentService.submitAssessment()` | `shared-services/src/services/assessment.service.ts` | **83–119** |

Both are in `AssessmentService` class — ideal single integration point.

### 2. Where Scoring Currently Occurs

| Location | File | Nature |
|----------|------|--------|
| `calculatePHQ9Score()` | `shared-types/src/utils/scoring.ts` | Pure function, **frontend-only usage** (in `FacilitatorStudentsPage.tsx`) |
| `calculateGAD7Score()` | `shared-types/src/utils/scoring.ts` | Pure function, frontend-only |
| `calculateDASS21Score()` | `shared-types/src/utils/scoring.ts` | Pure function, frontend-only |

**Key finding**: Scoring logic exists in `shared-types` (accessible from both frontend and backend) but is **only called from the UI**. No scoring happens in the service layer. Scores are **not persisted**.

### 3. Best Integration Point

**`assessmentService.submitAttempt()`** (line 228–248).

After `assessmentAttemptRepository.update()` sets status to 'submitted', a new risk evaluation call should be injected. This is the cleanest integration point because:
- The submitted answers are available as the `answers` parameter
- The `attemptId` is known for linking
- Runs after the attempt is finalized
- Service already has access to all repositories needed

Phase 3A (`submitAssessment()`) could also be integrated but Phase 3B is the primary risk-screening flow.

### 4. RiskAlertDocument Field Analysis

Current `RiskAlertDocument` (firestore.types.ts lines 67–74):

```typescript
export interface RiskAlertDocument extends FirestoreDocument {
  studentId: string;
  facilitatorId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  status: 'open' | 'acknowledged' | 'resolved';
}
```

| Field | Supports Phase 4A? | Issue |
|-------|-------------------|-------|
| `studentId` | ✅ Yes | Links to student |
| `facilitatorId` | ✅ Yes | Identifies responsible facilitator |
| `severity` | ✅ Yes | Maps directly to risk levels |
| `title` | ✅ Yes | For human-readable summary |
| `description` | ⚠️ Partial | Can hold text but not structured data |
| `status` | ✅ Yes | Alert lifecycle supported |
| `assessmentAttemptId` | ❌ **Missing** | No link back to triggering attempt |
| `overallRiskScore` | ❌ **Missing** | No numeric composite score |
| `riskFlags` | ❌ **Missing** | No structured list of flags like "Severe Depression" |
| `domainScores` | ❌ **Missing** | No individual PHQ-9/GAD-7/DASS-21 scores stored |

**Conclusion**: `RiskAlertDocument` needs **3 new fields** added for structured risk data (`assessmentAttemptId`, `overallRiskScore`, `riskFlags`). Domain scores are derivable from the attempt's stored answers.

### 5. Scoring Utilities Reuse Assessment

The three scoring functions in `shared-types/src/utils/scoring.ts`:
- `calculatePHQ9Score(answers: Record<string, string>)`
- `calculateGAD7Score(answers: Record<string, string>)`
- `calculateDASS21Score(answers: Record<string, string>)`

**Reusable as-is.** They are pure functions with no side effects, no UI dependencies, and operate on `Record<string, string>`. They can be imported into the service layer directly since `shared-types` is already a dependency of `shared-services`.

---

## Step 2 — Architecture Design

### Principle: Minimal new code, maximal reuse

```
AssessmentService.submitAttempt()
    │
    ▼
AssessmentService._evaluateAndFlagRisk(attempt, answers)  // NEW
    │
    ├──► calculatePHQ9Score(answers)       // REUSE existing
    ├──► calculateGAD7Score(answers)       // REUSE existing
    ├──► calculateDASS21Score(answers)     // REUSE existing
    │
    ▼
RiskEvaluationResult (NEW type in shared-types)
    │
    ├──► RiskAlertService.createAlert()    // EXTEND existing
    └──► Update AssessmentAttemptDocument with risk metadata  // EXTEND existing document
```

### No new services, no new repositories — only extend existing ones.

---

## Step 3 — Risk Engine Design

One central function: `evaluateAssessmentRisk()` in the existing `assessment.service.ts`.

Input: `AssessmentAttemptDocument` (with its answers array) + student data
Output: `RiskEvaluationResult`

```typescript
interface RiskEvaluationResult {
  overallRiskLevel: 'low' | 'moderate' | 'high' | 'critical';
  overallRiskScore: number;          // 0–100 composite
  riskFlags: RiskFlag[];             // structured flag list
  requiresImmediateAttention: boolean;
  domainResults: {
    phq9: ScoreResult;
    gad7: ScoreResult;
    dass21: DASS21Result;
  };
}

interface RiskFlag {
  type: 'severe_depression' | 'severe_anxiety' | 'severe_stress' |
        'multiple_severe_domains' | 'immediate_attention' | string;
  label: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
}
```

**Composite risk score algorithm** (single source of truth in one function):
- PHQ-9 ≥ 15 → +40 points (moderately severe or severe depression)
- GAD-7 ≥ 10 → +30 points (moderate or severe anxiety)
- DASS-21 any subscale ≥ 21 → +30 points (severe/extremely severe)
- Multiple severe domains → +20 points bonus
- Total capped at 100

**Risk level mapping:**
- 0–19 → low
- 20–39 → moderate
- 40–69 → high
- 70–100 → critical

**Requires immediate attention** → `overallRiskLevel === 'critical'`

---

## Step 4 — Automatic Flags

After `evaluateAssessmentRisk()` produces the result, flags are derived automatically:

| Flag | Trigger | Severity |
|------|---------|----------|
| `severe_depression` | PHQ-9 severity includes "severe" | critical |
| `severe_anxiety` | GAD-7 severity includes "severe" | critical |
| `severe_stress` | DASS-21 stress severity ≥ "Severe" | critical |
| `multiple_severe_domains` | ≥ 2 domains are severe/critical | critical |
| `immediate_attention` | `requiresImmediateAttention === true` | critical |
| `moderate_depression` | PHQ-9 severity is "Moderate depression" | high |
| `moderate_anxiety` | GAD-7 severity is "Moderate anxiety" | high |

Flags are stored as an array of structured objects on the `AssessmentAttemptDocument` and on the `RiskAlertDocument`.

---

## Step 5 — Automatic Risk Alert Creation

Extend `riskAlertService` with one new method:

```typescript
async createAlert(params: {
  studentId: string;
  assessmentAttemptId: string;
  evaluation: RiskEvaluationResult;
}): Promise<string>
```

Called from `AssessmentService.submitAttempt()` after the attempt is saved with status 'submitted'.

The method:
1. Determines `facilitatorId` (via the assessment definition's `facilitatorId`)
2. Maps `overallRiskLevel` → `severity` field
3. Sets `title` and `description` from evaluation data
4. Stores structured `riskFlags` and `overallRiskScore` in new `RiskAlertDocument` fields
5. Sets status to `'open'`

---

## Step 6 — Student Prioritization Data

Risk metadata stored in **two places**:

### On `AssessmentAttemptDocument` (new fields):
```typescript
// NEW fields on AssessmentAttemptDocument:
overallRiskLevel?: 'low' | 'moderate' | 'high' | 'critical';
overallRiskScore?: number;
riskFlags?: RiskFlag[];
```

### On `RiskAlertDocument` (new fields):
```typescript
// NEW fields on RiskAlertDocument:
assessmentAttemptId: string;
overallRiskScore?: number;
riskFlags?: RiskFlag[];
```

This enables future UI to:
- Sort students by `overallRiskLevel` (critical first)
- Filter by risk level
- Display severity breakdown
- Link alerts back to specific attempts

---

## Step 7 — Deliverables Summary

### Files to Modify (5 files, ~150 lines total)

| # | File | Change | Est. Lines |
|---|------|--------|------------|
| 1 | `shared-types/src/types/assessment.types.ts` | Add `RiskFlag` type, add fields to `AssessmentAttemptDocument` | +15 |
| 2 | `shared-types/src/types/firestore.types.ts` | Add fields to `RiskAlertDocument` | +5 |
| 3 | `shared-types/src/index.ts` | No change needed (barrel exports already cover these) | 0 |
| 4 | `shared-services/src/services/assessment.service.ts` | Add `evaluateAssessmentRisk()` + `_evaluateAndFlagRisk()` + call from `submitAttempt()` | +60 |
| 5 | `shared-services/src/services/risk-alert.service.ts` | Add `createAlert()` method | +25 |
| 6 | `shared-services/src/services/index.ts` | No change needed (services already exported) | 0 |
| **Total** | | | **~105 lines** |

### New Files (1 file, ~40 lines)

| # | File | Content | Est. Lines |
|---|------|---------|------------|
| 1 | `shared-types/src/utils/risk-evaluation.ts` | Single `evaluateAssessmentRisk()` function + `RiskEvaluationResult` + `RiskFlag` types | +40 |
| **Total** | | | **~40 lines** |

### Repository Changes
- **None.** No new repositories. No existing repository modifications. All data writes go through existing repositories (`assessmentAttemptRepository.update()`, `riskAlertRepository.create()`).

### Service Changes
- **Extend** `AssessmentService` — add 1 private method + 1 extension to `submitAttempt()`
- **Extend** `RiskAlertService` — add 1 new public method `createAlert()`
- No new services.

### Firestore Changes
- **Indexes**: No new indexes required (queries by `studentId` + `overallRiskLevel` are single-field).
- **Rules**: No changes needed (risk data is stored on existing collections with existing rules).

### Migration Requirements
- **None.** New fields are optional on existing documents. Existing documents without risk data will work as before. No data migration needed.

### Estimated Total: ~145 lines of new/modified code

---

## Implementation Complete

### Changes Applied

| File | Change | Lines |
|------|--------|-------|
| `shared-types/src/utils/risk-evaluation.ts` | **NEW** — Single source of truth. Constants at top (`PHQ9_THRESHOLDS`, `GAD7_THRESHOLDS`, `DASS21_THRESHOLDS`, `OVERALL_RISK_THRESHOLDS`). `evaluateAssessmentRisk()` function that returns individual domain scores + composite evaluation. | +110 |
| `shared-types/src/utils/risk-evaluation.test.mjs` | **NEW** — 16 unit tests covering: PHQ-9 severe, PHQ-9 moderate, GAD-7 severe, DASS-21 severe, multiple severe domains, low-risk, immediate attention, empty/partial/non-numeric answers. **All pass.** | +160 |
| `shared-types/src/types/assessment.types.ts` | **MODIFIED** — Added import of `RiskLevel`, `RiskFlag` from risk-evaluation. Added `overallRiskLevel?`, `overallRiskScore?`, `riskFlags?` to `AssessmentAttemptDocument`. | +5 |
| `shared-types/src/types/firestore.types.ts` | **MODIFIED** — Added `assessmentAttemptId?`, `overallRiskScore?`, `riskFlags?` to `RiskAlertDocument`. | +5 |
| `shared-types/src/index.ts` | **MODIFIED** — Added `export * from './utils/risk-evaluation'`. | +1 |
| `shared-services/src/services/risk-alert.service.ts` | **MODIFIED** — Added `createAlert()` method that maps risk level to severity, builds title/description, stores structured flag data. | +30 |
| `shared-services/src/services/assessment.service.ts` | **MODIFIED** — Added import of `evaluateAssessmentRisk` + `riskAlertService`. Added `_evaluateAndFlagRisk()` private method. Integrated into `submitAttempt()` post-save. | +55 |

### Key Design Decisions (based on your feedback)

1. ✅ **Returns individual domain scores** (PHQ-9, GAD-7, DASS-21 full breakdown) alongside composite — no recalculation needed later
2. ✅ **All thresholds as constants** (`PHQ9_THRESHOLDS`, `GAD7_THRESHOLDS`, `DASS21_THRESHOLDS`, `OVERALL_RISK_THRESHOLDS`) — change in one place
3. ✅ **Metadata persisted on every submission** — even low-risk attempts get scored metadata saved
4. ✅ **Alert created only when risk ≥ moderate** (moderate, high, critical)
5. ✅ **16 unit tests** using Node.js built-in test runner — no dependencies needed
6. ✅ **No duplicate logic** — all threshold logic in `risk-evaluation.ts`
7. ✅ **No new services or repositories** — extended existing ones only

### Files Modified
**4 existing files** + **2 new files** = ~366 total lines

### Integration Points
- `assessmentService.submitAttempt()` → calls `_evaluateAndFlagRisk()` after save
- `evaluateAssessmentRisk()` → pure function, reusable from frontend or backend
- `riskAlertService.createAlert()` → only when risk ≥ moderate

### No Changes Required
- Firestore rules (existing `risk_alerts` rules cover the new optional fields)
- Firestore indexes (single-field queries on `studentId` + `overallRiskLevel`)
- Data migration (all new fields are optional)
- Repositories (no new or modified repositories)
- Frontend/UI (this phase is backend only)
- Mobile (no changes)
- Dashboards (no changes)
- Notifications/messaging (no changes)

## Summary

| Aspect | Decision |
|--------|----------|
| New services | **0** — extend existing |
| New repositories | **0** — reuse existing |
| New files | **2** — `risk-evaluation.ts` + test file |
| Files modified | **4** — types (2), services (2) |
| Firestore migration | **None** |
| Scoring logic reuse | **100%** — existing `scoring.ts` functions used as-is |
| Threshold duplication | **None** — all risk logic in one function with constants |
| Total lines | ~366 |
| Unit tests | **16 all passing** |
