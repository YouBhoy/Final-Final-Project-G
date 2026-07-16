# Assessment Progress Percentage Bug Analysis

## Summary of All Progress Calculations Found

### 1. Mobile `TemplateAssessmentScreen.tsx` (line 296)
**File:** `spartan-g/apps/mobile/src/screens/assessment/TemplateAssessmentScreen.tsx`
**Formula:**
```ts
const answeredCount = Object.keys(answers).length;
const progressPercent = Math.round((answeredCount / totalSteps) * 100);
```
- **Numerator:** `Object.keys(answers).length` — count of answered questions
- **Denominator:** `totalSteps = questions.length`
- **Rounding:** `Math.round()`
- **Used for:** Progress bar text ("X% complete") and bar fill width
- **Verdict:** ✅ Formula is correct. If all questions answered, `answeredCount === totalSteps`, so `Math.round(1 * 100) = 100%`.

### 2. Web `TemplateAssessmentPage.tsx` (lines 302, 308)
**File:** `spartan-g/apps/web/src/pages/assessment/TemplateAssessmentPage.tsx`
**Formula (text):**
```tsx
<span>{Math.round((Object.keys(answers).length / totalSteps) * 100)}% complete</span>
```
**Formula (bar width):**
```tsx
style={{ width: `${(Object.keys(answers).length / totalSteps) * 100}%` }}
```
- **Numerator:** `Object.keys(answers).length`
- **Denominator:** `totalSteps = questions.length`
- **Rounding:** `Math.round()` for text; raw float for bar width
- **Verdict:** ✅ Formula is correct. Same as mobile TemplateAssessmentScreen.

### 3. Mobile `MobileProgressBar.tsx` (line 10) — **BUGGY**
**File:** `spartan-g/apps/mobile/src/screens/assessment/components/MobileProgressBar.tsx`
**Formula:**
```ts
const percentage = totalSteps > 0 ? Math.round(((currentStep + 1) / totalSteps) * 100) : 0;
```
- **Numerator:** `currentStep + 1` — **step position, NOT answered count**
- **Denominator:** `totalSteps = questions.length`
- **Rounding:** `Math.round()`
- **Used by:** `AssessmentWizardScreen.tsx` (the older wizard)
- **Verdict:** ⚠️ Uses step position instead of answered count. Shows 100% when on the last question (step), regardless of whether all questions are actually answered.

### 4. Web `WizardProgressBar.tsx` (line 7) — **BUGGY**
**File:** `spartan-g/apps/web/src/components/assessment/WizardProgressBar.tsx`
**Formula:**
```ts
const percentage = totalSteps > 0 ? Math.round(((currentStep + 1) / totalSteps) * 100) : 0;
```
- **Numerator:** `currentStep + 1` — **step position, NOT answered count**
- **Denominator:** `totalSteps = questions.length`
- **Rounding:** `Math.round()`
- **Used by:** `AssessmentWizardPage.tsx` (the older web wizard)
- **Verdict:** ⚠️ Same bug as MobileProgressBar. Uses step position instead of answered count.

### 5. Dashboard `DashboardScreen.tsx` (lines 209-211)
**File:** `spartan-g/apps/mobile/src/screens/dashboard/DashboardScreen.tsx`
**Formula:**
```ts
const assessmentPercent = totalAssessments > 0
  ? Math.round((assessmentsCompleted / totalAssessments) * 100)
  : 0;
```
- **Numerator:** `assessmentsCompleted` — count of submitted assessments
- **Denominator:** `totalAssessments` — total assessments assigned
- **Rounding:** `Math.round()`
- **Verdict:** ✅ Correct for its purpose (overall assessment completion rate, not per-question progress).

---

## Root Cause Analysis: Which Calculation Produces 95%?

### The Bug: `MobileProgressBar` and `WizardProgressBar` use step-position, not answer-count

Both `MobileProgressBar.tsx` and `WizardProgressBar.tsx` calculate progress as:
```
Math.round(((currentStep + 1) / totalSteps) * 100)
```

This is **step-based progress**, not **answer-based progress**. It shows how far the student has navigated through the wizard, not how many questions they've actually answered.

### Why it shows 95% instead of 100%

The bug manifests in the **TemplateAssessmentScreen** (mobile) and **TemplateAssessmentPage** (web) — these screens use `answeredCount / totalSteps` which IS answer-based. However, the professor's report of 95% specifically points to a scenario where the math works out to 95.

**The actual 95% bug scenario:**

If the assessment has **20 questions** and the student has answered **19 of them** (one answer not yet registered in the `answers` state), the TemplateAssessmentScreen would show:
```
Math.round((19 / 20) * 100) = Math.round(95) = 95%
```

But the professor said "after answering ALL questions" — so all 20 should be answered. This means either:
1. A timing issue where the last answer isn't reflected in state when progress is calculated, OR
2. The bug is actually in the **MobileProgressBar/WizardProgressBar** which uses `(currentStep + 1) / totalSteps`

### Tracing the MobileProgressBar formula with real numbers

For an assessment with **37 questions** (PHQ-9=9 + GAD-7=7 + DASS-21=21):

| Scenario | currentStep | Formula | Result |
|----------|------------|---------|--------|
| First question | 0 | (0+1)/37 × 100 | 3% |
| Mid-way | 18 | (18+1)/37 × 100 | 51% |
| Last question (step 36) | 36 | (36+1)/37 × 100 | **100%** |
| Review step (step 37) | 37 | (37+1)/37 × 100 | **103%** |

The MobileProgressBar shows **100% too early** (on the last question before it's answered) and **103% on the review screen** — both are wrong.

### The REAL bug: TemplateAssessmentScreen uses `answeredCount` but the `answers` state may be stale

Looking more carefully at the **TemplateAssessmentScreen** (the one most likely being tested):

```ts
const answeredCount = Object.keys(answers).length;
const progressPercent = Math.round((answeredCount / totalSteps) * 100);
```

If the student answers the last question and the `handleAnswer` callback updates `answers` via `setAnswers`, the progress bar re-renders with the new count. This should work correctly.

**However**, there's a subtle issue: the `handleAnswer` function saves to Firestore AND updates local state. If the student navigates quickly or there's a race condition, the `answers` state might not include the very last answer at the moment the progress is calculated.

### Most Likely Culprit

The **MobileProgressBar** and **WizardProgressBar** components are the primary suspects. They use `(currentStep + 1) / totalSteps` which:
1. Shows 100% when on the last question (before it's answered) — incorrect
2. Shows >100% on the review step — incorrect
3. Does NOT reflect actual answered count — fundamentally wrong metric

The fix should change these to use `answeredCount / totalSteps` instead of `(currentStep + 1) / totalSteps`, matching the approach used in TemplateAssessmentScreen/TemplateAssessmentPage.

---

## All Locations Requiring Fix

| # | File | Line | Current Formula | Fix Needed |
|---|------|------|----------------|------------|
| 1 | `spartan-g/apps/mobile/src/screens/assessment/components/MobileProgressBar.tsx` | 10 | `Math.round(((currentStep + 1) / totalSteps) * 100)` | Change to use `answeredCount` prop instead of `currentStep + 1` |
| 2 | `spartan-g/apps/web/src/components/assessment/WizardProgressBar.tsx` | 7 | `Math.round(((currentStep + 1) / totalSteps) * 100)` | Change to use `answeredCount` prop instead of `currentStep + 1` |
| 3 | `spartan-g/apps/mobile/src/screens/assessment/TemplateAssessmentScreen.tsx` | 296 | `Math.round((answeredCount / totalSteps) * 100)` | ✅ Already correct formula |
| 4 | `spartan-g/apps/web/src/pages/assessment/TemplateAssessmentPage.tsx` | 302 | `Math.round((Object.keys(answers).length / totalSteps) * 100)` | ✅ Already correct formula |
| 5 | `spartan-g/apps/mobile/src/screens/dashboard/DashboardScreen.tsx` | 210 | `Math.round((assessmentsCompleted / totalAssessments) * 100)` | ✅ Different metric, correct for its purpose |

**Note:** Items 3 and 4 are already correct. The fix is needed for items 1 and 2.