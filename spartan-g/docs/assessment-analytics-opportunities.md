# Assessment Analytics Opportunities

Date: 2026-10-06
Scope: Existing assessment data that can support analytics, plus tracking gaps

This document describes what the current SPARTAN-G assessment implementation already stores and what can be added later. It does not modify application code or Firebase data.

## 1. Existing Assessment Data

The application currently has two assessment data models.

### A. Phase 3A response model

Collection:

```text
assessment_responses/{responseId}
```

Each response can contain:

- `assessmentId`
- `questionId`
- `studentId`
- `value`
- `createdAt`
- `updatedAt`

The value type supports:

- Text responses.
- Arrays of selected values.
- Numeric values.

Repository:

```text
packages/shared-services/src/repositories/assessment-response.repository.ts
```

Available queries include:

- All responses for an assessment.
- A response for one assessment/question pair.
- All responses for a student.
- Batch upsert of responses.

### B. Phase 3B attempt model

Collection:

```text
assessment_attempts/{attemptId}
```

Each attempt can contain:

- `assessmentId`
- `studentId`
- `campus`
- `answers[]`
- `status`
- `startedAt`
- `submittedAt`
- `score`
- `feedback`
- `attemptNumber`
- `overallRiskLevel`
- `overallRiskScore`
- `riskFlags[]`
- `createdAt`
- `updatedAt`

Each answer contains:

```text
questionId
value
answeredAt
```

The answer value is currently stored as a string. For multiple-choice questions this is normally an option ID; for free-text questions it is the entered response.

Repository:

```text
packages/shared-services/src/repositories/assessment-attempt.repository.ts
```

Service:

```text
packages/shared-services/src/services/assessment.service.ts
```

## 2. Analytics Dimensions Already Available

The current data can support analytics by:

- Student.
- Campus.
- Assessment.
- Question.
- Attempt number.
- Assessment status.
- Start time.
- Submission time.
- Answer value.
- Score.
- Feedback.
- Overall risk level.
- Overall risk score.
- Risk flags.
- Created/updated timestamps.

The attempt model snapshots the student's campus when an attempt begins. This is useful because later campus changes do not rewrite historical attempt context.

## 3. Analytics We Can Build Now

### Participation and completion

- Number of students who started each assessment.
- Number of students who submitted each assessment.
- Completion rate by assessment.
- Completion rate by campus.
- In-progress versus submitted attempts.
- Average number of attempts per student.
- Maximum-attempt usage.
- Abandoned in-progress attempts based on old `updatedAt` or `startedAt` values.

### Question-level response analysis

- Response distribution for multiple-choice questions.
- Response distribution by campus.
- Response distribution by assessment version/template.
- Most frequently selected options.
- Questions with the highest unanswered rate.
- Text-response counts and exports.
- Changes in answer distributions over time.

### Risk and wellbeing analysis

- Risk-level distribution by campus.
- Risk-score averages and trends.
- Counts of moderate, high, and critical risk attempts.
- Common risk flags.
- Risk trends by assessment.
- Students with repeated elevated risk results.
- Relationship between completion and risk outcomes.

The existing service already calls `evaluateAssessmentRisk()` during submission and can store:

- `overallRiskLevel`
- `overallRiskScore`
- `riskFlags`

This provides an initial analytics foundation without adding a new scoring collection.

### Performance and grading

Where populated, the data can support:

- Score averages by assessment.
- Score distribution by campus.
- Passing rate.
- Attempts before passing.
- Grading turnaround using `submittedAt` and grading/update timestamps.
- Feedback availability and review status.

## 4. Analytics Not Currently Available

The current implementation does not preserve:

- Every revision of an answer.
- Time spent on each question.
- Time between question display and answer selection.
- Question navigation history.
- Pause/resume events.
- Abandoned-session reason.
- Browser/device/session details.
- Network/offline state during answer submission.
- Question-level score history.
- Historical assessment-definition snapshots.
- A formal analytics event stream.

The current `answers[]` array stores the latest answer for each question, not the complete change history.

## 5. Important Data-Model Considerations

### Assessment versioning

Analytics should distinguish assessment versions. If question text, option order, scoring, or question IDs change while reusing the same assessment ID, historical comparisons may become invalid.

Recommended future fields:

```text
templateId
version
questionSetVersion
```

A submitted attempt should retain the question text/options or a version reference so historical reports remain interpretable.

### Stable question identifiers

Question IDs should remain stable for the same logical question. If a question is replaced, use a new question ID or version so analytics do not combine unrelated questions.

### Campus history

The Phase 3B attempt already stores a campus snapshot. This should remain immutable after submission. Reports should use the attempt campus for historical analysis rather than the student's current campus.

### Sensitive response data

Assessment answers may contain mental-health or wellbeing information. Analytics should use least-privilege access and avoid exposing raw text answers to users who only need aggregate counts.

Recommended separation:

- Aggregate dashboards for authorized administrators.
- Student-level risk views for authorized facilitators.
- Raw text responses only for explicitly authorized workflows.

## 6. Security and Access Boundaries

Current Firestore rules allow:

- Students to read their own assessment data.
- Facilitators and Super Admins to read assessment attempts/responses according to the current rules.
- Students to create/update their own permitted assessment data.
- Facilitators/Super Admins to manage certain assessment records.

Before adding analytics dashboards, verify that aggregate queries do not expose raw student identity or sensitive answers unnecessarily.

Potential hardening item:

`assessment_responses` currently permits a student to update their own response without an explicit parent-assessment submitted-status check. If submitted responses should be immutable, the rules should validate the parent assessment status before allowing updates.

## 7. Recommended Analytics Collections

A first dashboard can query existing collections directly. A separate analytics collection is not immediately necessary.

For larger datasets or precomputed reporting, consider a trusted backend-generated collection such as:

```text
assessment_analytics_daily/{date_assessment_campus}
```

Possible fields:

- `date`
- `assessmentId`
- `campus`
- `startedCount`
- `submittedCount`
- `averageScore`
- `averageRiskScore`
- `riskLevelCounts`
- `questionResponseSummaries`

Because Cloud Functions are not deployed on the current Spark configuration, any precomputed analytics pipeline would need to run through an approved backend, scheduled process, or an on-demand Admin-only calculation until the project moves to Blaze.

## 8. Recommended First Analytics Features

The lowest-risk first phase is aggregate-only reporting:

1. Assessment participation totals.
2. Completion rates.
3. Campus breakdowns.
4. Attempt counts.
5. Risk-level and risk-score summaries.
6. Question response distributions without raw free-text display.
7. Date-range filtering.

These reports can use existing Firestore documents and avoid collecting additional personal telemetry.

## 9. Recommended Future Tracking Events

If behavioral analytics are needed later, add explicit events rather than inferring everything from document timestamps:

```text
assessment_started
assessment_resumed
question_viewed
answer_selected
answer_changed
section_completed
assessment_paused
assessment_abandoned
assessment_submitted
```

Each event should be evaluated for privacy, retention, and access requirements before being persisted.

## 10. Current Conclusion

Student assessment answers are already tracked in Firebase through `assessment_responses` and `assessment_attempts`.

The strongest existing analytics dimensions are:

- Student.
- Campus.
- Assessment.
- Question.
- Answer value.
- Attempt number.
- Submission timestamps.
- Score.
- Risk level, score, and flags.

The most valuable next step is an Admin-only aggregate analytics view built from existing attempts and responses. Detailed behavioral telemetry, immutable answer history, version-aware reporting, and scheduled aggregates should be treated as later enhancements with explicit privacy and security review.
