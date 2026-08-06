# Codebase Audit Report: Spartan-G

## Date: 2026-07-29
## Purpose: Pre-feature planning for "Garden" gamified reward system

---

## 1. Assessment Flow (Student Side)

### 1.1 Files Involved in the Assessment Wizard

**Mobile (React Native / Expo):**

| File | Role |
|------|------|
| `apps/mobile/src/screens/assessment/AssessmentsListScreen.tsx` | Lists published assessments, modal for detail view, calls `assessmentService.startAttempt()` then navigates |
| `apps/mobile/src/screens/assessment/TemplateAssessmentScreen.tsx` | **Active** wizard screen — stepped UI for taking an assessment (true_false, multiple_choice, short_answer) |
| `apps/mobile/src/screens/assessment/AssessmentWizardScreen.tsx` | **Older/alternate** wizard (appears partially deprecated — TemplateAssessmentScreen is wired in StudentNavigator instead) |
| `apps/mobile/src/screens/assessment/components/MobileProgressBar.tsx` | Progress bar sub-component |
| `apps/mobile/src/screens/assessment/components/MobileQuestionCard.tsx` | Question card sub-component |
| `apps/mobile/src/screens/assessment/components/MobileReviewScreen.tsx` | Review screen before submission |

**Backend / Shared Services:**

| File | Role |
|------|------|
| `packages/shared-services/src/services/assessment.service.ts` | All assessment logic: start/resume/submit/saveAnswer/getAttempt, risk evaluation integration |
| `packages/shared-services/src/repositories/assessment.repository.ts` | CRUD on `assessments` collection (Phase 3A + 3B definitions) |
| `packages/shared-services/src/repositories/assessment-attempt.repository.ts` | CRUD on `assessment_attempts` collection |

**Web (React / Vite):**

| File | Role |
|------|------|
| `apps/web/src/pages/assessment/AssessmentWizardPage.tsx` | Web assessment wizard |
| `apps/web/src/pages/assessment/TemplateAssessmentPage.tsx` | Web template-based assessment |
| `apps/web/src/pages/student/StudentAssessmentsPage.tsx` | Web student assessment list |
| `apps/web/src/components/assessment/WizardProgressBar.tsx` | Web progress bar |
| `apps/web/src/hooks/useAssessmentTemplates.ts` | Real-time subscription hook for templates |
| `apps/web/src/hooks/useAssessmentQuestions.ts` | Real-time subscription hook for questions |

---

### 1.2 Progress Tracking & Persistence

**Local state shape** (TypeScript from `WizardState` in `assessment.types.ts`):
```typescript
interface WizardState {
  currentStep: number;                    // 0-indexed question index
  answers: Record<string, string>;        // questionId → answer value
  isSubmitting: boolean;
  startedAt: Date;
}
```

**How it works:**
1. **On mount** — `TemplateAssessmentScreen` loads the attempt doc from `assessment_attempts`, restores saved answers into local `answers` state, and sets `currentStep` to the first unanswered question.
2. **Per-answer** — Every answer selection fires `assessmentService.saveAnswer()` which writes to the `assessment_attempts` Firestore document's `answers` array (upsert by questionId). This is a **direct Firestore write**, not a separate sub-collection.
3. **On navigate** — Short-answer text inputs are saved only on blur/navigate via `saveCurrentTextInput()`.
4. **On submission** — `assessmentService.submitAttempt()` writes the final answers array + status='submitted' + risk metadata all in one Firestore update call.

**Important:** There is NO pending/offline queue. Save is fire-and-forget with an error banner shown on failure.

**Doc ID pattern for attempts:** `{assessmentId}_{studentId}_{attemptNumber}` (e.g. `asmt_abc123_stu456_1`)

---

### 1.3 Scoring & Severity Calculation

**All scoring logic is client-side**, computed synchronously from answers in memory. Located in **shared-types package**:

| File | What it calculates |
|------|-------------------|
| `packages/shared-types/src/utils/scoring.ts` | `calculatePHQ9Score()`, `calculateGAD7Score()`, `calculateDASS21Score()` — pure functions taking `Record<string, string>` (questionId → answer value) |
| `packages/shared-types/src/utils/risk-evaluation.ts` | `evaluateAssessmentRisk()` — composite risk evaluation combining all 3 instruments into `overallRiskLevel` (low/moderate/high/critical), `overallRiskScore` (0–100), and `riskFlags[]` |

**Trigger point:** In `assessment.service.ts` line 256–273, right before the status update in `submitAttempt()`. The risk evaluation is computed synchronously from the answers in memory and included in the **same Firestore write** as the submission status update.

**Question ID convention for scoring:**
- PHQ-9: `phq1` through `phq9`
- GAD-7: `gad1` through `gad7`
- DASS-21: `dass1` through `dass21` (with subscale groupings by index)

**Note:** The scoring functions look for specific question IDs (`phq1`, `gad1`, etc.), meaning they expect the assessment definition's questions to use these IDs. If non-standard IDs are used, `evaluateAssessmentRisk()` silently catches errors and skips scoring (line 271).

---

### 1.4 Submission Flow (End-to-End)

```
Student taps "Submit" on review screen
  → TemplateAssessmentScreen.handleSubmit()
    → assessmentService.submitAttempt(attemptId, finalAnswers)
      → Fetch attempt doc, verify status === 'in_progress'
      → Evaluate risk: evaluateAssessmentRisk(answersRecord) 
          → calculatePHQ9Score, calculateGAD7Score, calculateDASS21Score (all in-memory)
          → Returns overallRiskLevel, overallRiskScore, riskFlags, domainResults
      → Update assessment_attempts document in ONE write:
          { answers, status: 'submitted', submittedAt, overallRiskLevel, overallRiskScore, riskFlags }
      → IF riskLevel is moderate/high/critical:
          riskAlertService.createAlert({ studentId, facilitatorId, attemptId, evaluation })
            → Creates document in risk_alerts collection
  → Student sees "Congratulations!" screen
```

**Side effect — AI summaries:** The `gemini.service.ts` provides AI summary generation, but it is **NOT triggered automatically** on submission. It appears to be a separate/facilitator-initiated flow (called from `StudentDetailScreen` via a "Generate AI Summary" button). The summary is cached in `assessment_ai_summaries` collection with doc ID = `attemptId`.

---

## 2. Navigation & Screen Structure

### 2.1 Student-Side Navigation Tree

```
MobileRootStack (RootNavigator.tsx)
├── Auth (AuthNavigator)
│   ├── Login
│   ├── Register
│   ├── ForgotPassword
│   └── WebOnlyRedirect
├── Student (StudentNavigator)
│   ├── StudentTabs (BottomTabNavigator) ← 5 tabs
│   │   ├── StudentHome        → DashboardScreen (title: "Home", icon: home)
│   │   ├── StudentCourses     → FindFacilitatorScreen (title: "Facilitators", icon: users)
│   │   ├── StudentAssignments → AssessmentsListScreen (title: "Assessments", icon: clipboard)
│   │   ├── StudentMessages    → MessagesScreen (title: "Messages", icon: message-circle)
│   │   └── StudentProfile     → StudentProfileScreen (title: "Profile", icon: user)
│   ├── CourseDetail (placeholder)
│   ├── AssignmentDetail (placeholder)
│   ├── ConversationDetail
│   ├── AssessmentWizard → TemplateAssessmentScreen
│   ├── BookAppointment
│   └── StudentAppointments
└── Facilitator (FacilitatorNavigator) ← separate
```

### 2.2 Current Bottom Tab Bar (Student)

**5 tabs currently**, using Feather icons and `lightColors.primary` (spartanRed) as active tint:
1. **Home** (home icon)
2. **Facilitators** (users icon)
3. **Assessments** (clipboard icon)
4. **Messages** (message-circle icon)
5. **Profile** (user icon)

A new **6th "Garden" tab** (or any replacement) would slot into `StudentMobileTabParamList` in `mobile.types.ts` and the `StudentTabs()` component in `StudentNavigator.tsx`.

### 2.3 Facilitator Tabs (for reference)

**6 tabs:**
1. Home (grid icon)
2. Appts (calendar icon)
3. Chats (message-circle icon)
4. Hours (clock icon)
5. Students (users icon)
6. Profile (user icon)

---

## 3. Firestore Collections Actually in Use

Based on `COLLECTIONS` constant + repositories + rules file analysis:

| Collection | Doc ID Pattern | Files that Read/Write | Student-Writable? | Notes |
|-----------|---------------|---------------------|-------------------|-------|
| `users` | `{uid}` | user.repository.ts, firestore.rules | Read: own doc + facilitator profiles. Write: own doc (self-update). | Created on registration |
| `profiles` | `{uid}` | profile.repository.ts | Read: own + facilitator. Write: own. | Profile data |
| `courses` | auto-ID | (via rules) | Read: published. Write: facilitator/admin only. | |
| `enrollments` | auto-ID | (via rules) | Create: own studentId. Read: own. | |
| `assignments` | auto-ID | (via rules) | Read: active users. Write: facilitator/admin. | |
| `submissions` | auto-ID | (via rules) | Create: own. Update: student can update (not score/feedback). | Phase 3A |
| `notifications` | `notif_{userId}_{timestamp}` | notification.repository.ts, appointment.service.ts | Read/Update: owner. Create: authenticated. | |
| `device_tokens` | `{uid}` | device-token.repository.ts | Create/Update: own. | FCM tokens |
| `announcements` | auto-ID | (via rules) | Read: active users. Write: facilitator/admin. | |
| `audit_logs` | auto-ID | (via rules) | Admin-only create. | |
| `risk_alerts` | auto-ID | risk-alert.repository.ts, risk-alert.service.ts | Read: own studentId. Create/Update: facilitator/admin. | Created on critical assessment submission |
| `appointments` | auto-ID | appointment.repository.ts, appointment.service.ts | Create: own studentId (status='requested'). Update: cancel own. | |
| `facilitator_student_links` | `{facilitatorId}_{studentId}` | facilitator-student-link.repository.ts | Read: own. Create: both students and facilitators. | |
| `conversations` | auto-ID | conversation.repository.ts, messaging.service.ts | Create: if participant. Update: if participant (metadata only). | |
| `messages` | auto-ID | message.repository.ts, messaging.service.ts | Create: own senderId. Update: readBy only. | |
| `work_hours_schedules` | auto-ID | work-hours.repository.ts | Read: active users. Write: own facilitatorId. | |
| `appointment_slots` | auto-ID | appointment-slot.repository.ts | Read: active users. Write: facilitator manages own. Students can reserve. | |
| `assessment_templates` | auto-ID | assessment-template.repository.ts | Read: active users. Write: facilitator/admin. | Phase 3A |
| `assessment_questions` | auto-ID | assessment-question.repository.ts | Read: active users. Write: facilitator/admin. | Phase 3A |
| `assessments` | auto-ID or custom | assessment.repository.ts | **Student can create** (start attempt) + update (save answers while in_progress). Facilitator/admin manage definitions. | Phase 3A + 3B shared |
| `assessment_responses` | auto-ID | assessment-response.repository.ts | Create/Update: own studentId. | Phase 3A per-question responses |
| `assessment_attempts` | `{assessmentId}_{studentId}_{n}` | assessment-attempt.repository.ts | **Student can create** (status='in_progress') + update (while in_progress, can't set score/feedback). | Phase 3B core collection |
| `assessment_overrides` | (likely `{assessmentId}_{studentId}`) | assessment-override.service.ts | Read: own. Write: facilitator/admin only. | Per-student max-attempt override |
| `assessment_ai_summaries` | `{attemptId}` | gemini.service.ts | Read/Write: facilitator/admin only. | AI-generated summaries |

**Key insight for Garden feature:** The `assessment_attempts` collection is student-writable (create + update while in_progress), and `assessments` is read-only by students for definitions. These are the two most natural hooks for a gamification trigger (e.g., on submission → grant XP/water a plant).

---

## 4. Shared Packages

### 4.1 `@spartan-g/shared-types` (packages/shared-types)

**Assessment-related exports:**
```typescript
// Types
AssessmentDocument, AssessmentDefinitionDocument, AssessmentAttemptDocument
AssessmentQuestion, AssessmentAnswer, QuestionOption, QuestionType
WizardState, AttemptStatus, AssessmentResponseDocument

// Scoring & Risk
ScoreResult, DASS21Result, RiskEvaluationResult, RiskFlag, RiskLevel
calculatePHQ9Score(), calculateGAD7Score(), calculateDASS21Score()
evaluateAssessmentRisk()
PHQ9_THRESHOLDS, GAD7_THRESHOLDS, DASS21_THRESHOLDS, OVERALL_RISK_THRESHOLDS

// Navigation
StudentMobileTabParamList, StudentMobileStackParamList
FacilitatorMobileTabParamList, FacilitatorMobileStackParamList

// Collections constant
COLLECTIONS.ASSESSMENTS, COLLECTIONS.ASSESSMENT_ATTEMPTS, COLLECTIONS.ASSESSMENT_AI_SUMMARIES, etc.

// RBAC
PERMISSIONS (includes TAKE_ASSESSMENTS, VIEW_ASSESSMENTS, etc.)
ROLES, hasPermission(), requiresWebPortal()
```

### 4.2 `@spartan-g/shared-services` (packages/shared-services)

**Assessment-related exports:**
```typescript
assessmentService       // getAssessmentDefinition, getAttempt, startAttempt, saveAnswer, submitAttempt, getAttemptCount, getInProgressAttempt, getStudentAttempts, getAttemptsByStudent
assessmentRepository    // CRUD + subscribePublished (realtime)
assessmentAttemptRepository
assessmentOverrideService
riskAlertService
geminiService           // generateSummary, getCachedSummary, cacheSummary

// Store
useAuthStore            // Zustand store: session, status, isInitialized
```

### 4.3 `@spartan-g/shared-ui` (packages/shared-ui)

**Exports:**
```typescript
// Theme
palette, lightColors, darkColors, ColorScheme  // (from theme/colors.ts)
typography, fontSize, lineHeight               // (from theme/typography.ts)
spacing, borderRadius, shadows                 // (from theme/spacing.ts)

// Guards
evaluateRoleGuard

// Helpers
formatTimeOnly, formatDateTime, formatWorkHours  // (from helpers/date.ts)
```

**No UI components** are exported (no buttons, cards, etc.). This package is purely theme + helpers.

---

## 5. State Management & Styling Conventions

### 5.1 State Management

**Zustand** is the state management library:
- `useAuthStore` — authentication state (session, status, platform)
- `useAppStore` — app-level preferences (theme mode)

Both are in `packages/shared-services/src/store/`.

**No React Query, Redux, or Context-based state management** is used elsewhere in the codebase for data fetching. Firebase Firestore is accessed directly via repository classes that wrap the Firestore SDK. The `subscribePublished()` method on `assessmentRepository` uses Firestore `onSnapshot` (real-time listener) directly.

**Pattern:** Repositories → Services → Screens. Screens call services, services call repositories, repositories call Firestore SDK.

### 5.2 Styling Convention

**`StyleSheet.create()`** is used universally in the mobile app. No styled-components or CSS-in-JS libraries.

**Shared color palette file:** `packages/shared-ui/src/theme/colors.ts`

```typescript
export const palette = {
  spartanRed: '#DC2626',
  spartanRedDark: '#991B1B',
  spartanGold: '#F59E0B',
  // ... slates, semantic colors
};

export const lightColors = {
  primary: palette.spartanRed,    // ← This is the main app color (used everywhere)
  background: palette.slate50,
  surface: palette.white,
  text: palette.slate900,
  // ... 40+ named tokens
};
```

The entire app uses `lightColors` throughout (no dark mode toggle seen in practice despite `darkColors` being defined).

The web app uses **Tailwind CSS** (seen in vite.config.ts: `plugins: [tailwindcss(), react()]`).

---

## 6. Existing Animation / Gamification-Adjacent Code

### 6.1 Animation Libraries

**In `package.json` (mobile):**
- No `react-native-reanimated`
- No `lottie-react-native` or any Lottie library
- No `react-native-animatable`

**What IS used:**
- **React Native `Animated` API** — used in `RootNavigator.tsx` for the loading screen's shimmer progress bar (`Animated.Value`, `Animated.timing`, `Animated.loop`, `Easing.inOut`)
- **`LayoutAnimation`** — used in `StudentDetailScreen.tsx` for expand/collapse toggles on attempt details, risk results, and AI summary sections

### 6.2 Gamification / Streak / XP / Points

**None found.** 
- There are zero references to "streak", "XP", "points", "badge", "gamif", "level", or "achievement" in any application code.
- The only "score" references are clinical assessment scores (PHQ-9 score, GAD-7 score, risk score) — not game points.

### 6.3 Existing `Animated` Usage Patterns

The loading screen in `RootNavigator.tsx` demonstrates the pattern used:
```typescript
import { Animated, Easing } from 'react-native';

const fillWidth = useRef(new Animated.Value(0)).current;

useEffect(() => {
  const animation = Animated.loop(
    Animated.sequence([
      Animated.timing(fillWidth, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(fillWidth, { toValue: 0, duration: 0, useNativeDriver: false }),
    ]),
    { iterations: -1 },
  );
  animation.start();
  return () => animation.stop();
}, []);
```

**Key takeaway:** If the Garden feature wants animations (plant growing, watering, etc.), you'll need to add an animation library like `react-native-reanimated` (for performant UI animations) or `lottie-react-native` (for pre-made Lottie animations). The current codebase has no animation infrastructure beyond basic RN `Animated`.

---

## Appendix: Key Files for Garden Feature Hooks

| Hook Point | File | What to modify |
|-----------|------|----------------|
| Submission success | `assessment.service.ts` → `submitAttempt()` | Add garden reward grant (XP/coins/plant growth) after submission succeeds |
| Student tab bar | `StudentNavigator.tsx` + `mobile.types.ts` | Add 6th "Garden" tab |
| Student dashboard | `DashboardScreen.tsx` | Could show garden widget |
| Student state store | Could add new `useGardenStore` | Zustand store in `shared-services/src/store/` |
| New Firestore collection | `collections.ts` + rules | e.g. `garden_profiles`, `garden_rewards` |
| Shared types | `assessment.types.ts` or new `garden.types.ts` | Garden state types |