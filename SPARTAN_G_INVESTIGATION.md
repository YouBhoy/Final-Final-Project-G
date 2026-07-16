# Complete Investigation — Parts A-E

## Confirmation Required: Subtitle Wording

You said title "Congratulations!" is approved. For the subtitle, here are options:
1. "You've successfully completed your assessment." (concise, direct)
2. "Your responses have been recorded successfully." (current, functional)
3. "Well done! Your assessment has been submitted successfully." (warmer)

Let me know which you prefer and I'll apply it across all 4 screens.

---

## PART A: Submission Success Screen (Copy Update)

**Status:** Ready to implement. All 4 screens already have the green checkmark + "Assessment Submitted!" layout. Only copy needs updating.

**Changes per screen:**

**Mobile `AssessmentWizardScreen.tsx`** (line 239-241):
- Title: `"Assessment Submitted!"` → `"Congratulations!"`
- Subtitle: `"Your answers have been submitted successfully."` → *[your chosen wording]*

**Web `AssessmentWizardPage.tsx`** (line 389-390):
- Title: `"Assessment Submitted!"` → `"Congratulations!"`
- Subtitle: `"Thank you for completing the assessment. Your responses have been recorded."` → *[your chosen wording]*

**Mobile `TemplateAssessmentScreen.tsx`** (line 248-250):
- Title: `"Assessment Submitted!"` → `"Congratulations!"`
- Subtitle: `"Your responses have been recorded successfully."` → *[your chosen wording]*

**Web `TemplateAssessmentPage.tsx`** (line 226-228):
- Title: `"Assessment Submitted!"` → `"Congratulations!"`
- Subtitle: `"Your responses have been recorded successfully."` → *[your chosen wording]*

---

## PART B: Limit to 1 Attempt, Remove "Attempts" Count

**Status:** Two items ready, one pending confirmation.

**Seeder change** (Ready):
- `spartan-g/apps/web/src/pages/dev/SeederPage.tsx` line 14: `maxAttempts: 10` → `maxAttempts: 1`

**Firestore live document** (You confirmed `rJNot7eBFTElrRXvj1GG`):
- **Command to execute:** `updateDoc(doc(db, "assessments", "rJNot7eBFTElrRXvj1GG"), { maxAttempts: 1 })`
- Will proceed when you give the go-ahead.

**UI removals** (Ready — 5 locations):

| File | What to delete |
|------|---------------|
| `AssessmentsListScreen.tsx` line 138-140 | Remove `<Text style={styles.questionCount}>...attempt...</Text>` line |
| `AssessmentsListScreen.tsx` line 173-177 | Remove `<Text style={styles.modalQuestionCount}>...attempt...</Text>` line |
| `StudentAssessmentsPage.tsx` lines 119-123 | Remove entire `<p>Max {a.maxAttempts}...` block |
| `FacilitatorAssessmentsScreen.tsx` lines 140-143 | Remove entire `<View style={styles.metaItem}> Max Attempts` block |
| `FacilitatorAssessmentsPage.tsx` lines 116-118, 143-144 | Remove `<th>Max Attempts</th>` and `<td>{a.maxAttempts}</td>` |

---

## PART C: "Already Answered" Message

**Status:** Ready to implement. Cleanest approach — dedicated `isAlreadyCompleted` state.

**In both `AssessmentWizardScreen.tsx` and `AssessmentWizardPage.tsx`:**

Add state:
```ts
const [isAlreadyCompleted, setIsAlreadyCompleted] = useState(false);
```

Change limit block (in `load()`):
```ts
// BEFORE:
if (hasReachedLimit && !existingAttemptId) {
  setError(`You have used all ${assessmentData.maxAttempts} attempt(s)...`);
  return;
}

// AFTER:
if (hasReachedLimit && !existingAttemptId) {
  if (!cancelled) {
    setAssessment(assessmentData);
    setIsAlreadyCompleted(true);
    setIsLoading(false);
  }
  return;
}
```

Add render block (after the `isSubmitted` block, before `if (!assessment)`):
```tsx
if (isAlreadyCompleted) {
  return (
    // Green checkmark circle
    // "You have already answered the assessment"
    // "Your responses have been recorded. You cannot retake this assessment."
    // [Back to Assessments] button
  );
}
```

This uses a success-style UI (green check) instead of error-style, matching the visual pattern of the submitted screen but with different copy.

---

## PART D: No Regressions

**Both today's fixes are completely unaffected** by Parts A-C:

- **Resume fix** (`getInProgressAttempt`): Same check flow, same prioritization. Step 5 (resume) still runs when `existingAttemptId` is truthy.
- **Progress percentage fix** (`answeredCount` formula): Pure UI components (`MobileProgressBar.tsx`, `WizardProgressBar.tsx`) — not touched.

---

## PART E: Facilitator Attempt Override — Investigation & Plan

### 1. Data Model Recommendation

**Recommended: New `assessment_overrides` collection** — a small, focused collection keyed by a composite ID.

```typescript
// spartan-g/packages/shared-types/src/types/assessment.types.ts

export interface AssessmentOverrideDocument extends FirestoreDocument {
  assessmentId: string;
  studentId: string;
  maxAttemptsOverride: number;   // e.g. 2, 3, etc. — replaces the assessment's maxAttempts for this student
  grantedBy: string;             // facilitator UID
  grantedAt: Timestamp;
  reason?: string;               // optional: "Technical issue", "Special circumstances"
}
```

**Document ID convention:** `${assessmentId}_${studentId}` — allows direct lookup by composite key.

**Why a separate collection (not a field on the assessment or user doc):**
- Assessment doc is shared by all students — adding per-student data there would create conflicts (size bloat, security rule complexity).
- User doc already has assessment state — this is a different concern (attempt limit, not attempt data).
- A separate collection is clean, independently queryable (`where('studentId','==',x)` for facilitator to see all overrides granted), and follows the existing pattern (assessment_attempts, risk_alerts, etc. are all separate collections).
- Facilitator writes to this collection; students only need read (or don't need access at all).

### 2. Enforcement Logic Change

The limit check currently lives in `assessment.service.ts` `startAttempt()` (lines 179-181):

```ts
const attemptCount = await this.getAttemptCount(assessmentId, studentId);
if (attemptCount >= (assessment as any).maxAttempts) {
  throw new Error('Maximum number of attempts reached');
}
```

**Modified logic** (add an override check before the default limit check):

```ts
const attemptCount = await this.getAttemptCount(assessmentId, studentId);

// Check for facilitator override first
const override = await this.getAttemptOverride(assessmentId, studentId);
const effectiveMaxAttempts = override?.maxAttemptsOverride ?? (assessment as any).maxAttempts;

if (attemptCount >= effectiveMaxAttempts) {
  throw new Error('Maximum number of attempts reached');
}
```

Where `getAttemptOverride()` would be a new method on `AssessmentOverrideRepository`:
```ts
async getAttemptOverride(assessmentId: string, studentId: string): Promise<AssessmentOverrideDocument | null> {
  const overrideId = `${assessmentId}_${studentId}`;
  return this.getById(overrideId);
}
```

**This is a small, focused change** — only the `startAttempt()` method. The rest of the service (`getAttemptCount`, `getInProgressAttempt`, `submitAttempt`) is unchanged. The "already answered" check in Part C already uses `getAttemptCount()` which counts submitted attempts, so it naturally respects the override too.

### 3. Facilitator UI Placement

**Recommended location: Facilitator's student assessment history view.**

Looking at the existing codebase:
- **Mobile:** `FacilitatorStudentsScreen.tsx` exists but shows an assessment list. 
- **Web:** `FacilitatorStudentsPage.tsx` exists but we haven't reviewed it fully.

The cleanest approach: Add the override control to the **facilitator's student detail view** — specifically, the page/screen where a facilitator sees a specific student's assessment attempts. If that doesn't exist yet, the simplest first implementation is:

**Option A (Minimum):** A simple endpoint/input on the facilitator's assessment list view (either mobile `FacilitatorAssessmentsScreen.tsx` or web `FacilitatorAssessmentsPage.tsx`). When a facilitator taps a student who has submitted, they see an "Override Attempt Limit" button that opens a small form with a number input and optional reason field.

**Option B (Better):** A dedicated "student detail" screen where facilitators can see all of a student's attempts and set overrides per assessment. This is more work but more user-friendly.

**Recommended for Phase 1:** Add the override control to the **web** `FacilitatorAssessmentsPage.tsx` since it already has a table layout — add a new column or an action button that opens a modal. The mobile version can be added later.

**UI control:** A simple stepper or numeric input:
```
[Student: John Doe] [Assessment: Mental Health Screening]
Current limit: 1 (default) | Override: [2] ✅ Save
Reason: [Technical issue during submission]
```

### 4. Security & Firestore Rules

**New rules block needed** at the end of `firestore.rules`:

```
// ─── Assessment Attempt Overrides (facilitator feature) ────
match /assessment_overrides/{overrideId} {
  allow read: if isFacilitatorOrAdmin()
    || (isStudent() && resource.data.studentId == request.auth.uid);
  allow create, update: if isFacilitatorOrAdmin();
  allow delete: if isSuperAdmin();
}
```

This ensures:
- Only facilitators/admins can create or update overrides
- Students can read their own overrides (optional — could also restrict to facilitators only)
- Good audit trail via `grantedBy` and `grantedAt` fields

**⚠️ Flag:** We've had Firestore rules issues before. The rules change for `assessment_overrides` is straightforward (follows the same pattern as `risk_alerts`), but must be deployed separately from code changes. The new collection name `assessment_overrides` must also be added to `COLLECTIONS` in `collections.ts`.

### Implementation Scope Summary for Part E

| Step | File/Area | Complexity |
|------|-----------|------------|
| 1 | Add `ASSESSMENT_OVERRIDES` to `collections.ts` | Trivial |
| 2 | Add `AssessmentOverrideDocument` type to `assessment.types.ts` & re-export | Small |
| 3 | Create `AssessmentOverrideRepository extends BaseRepository` | Small (reuses existing pattern) |
| 4 | Add `getAttemptOverride()` to `assessment.service.ts` | Small |
| 5 | Modify `startAttempt()` limit check to check override first | Tiny (2 lines changed) |
| 6 | Add facilitator UI (web: modal on table) | Medium |
| 7 | Add Firestore rules for `assessment_overrides` | Small but requires separate deployment |

**Recommendation:** Parts A-D can be implemented now (they're independent and don't depend on Part E). Part E should be scoped as a separate ticket requiring its own review cycle, especially due to the Firestore rules component.