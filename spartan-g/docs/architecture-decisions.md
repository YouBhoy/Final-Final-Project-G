# SPARTAN-G Architecture Decisions (ADRs)

## ADR-001: Firebase Auth for Authentication
- **Status**: Accepted
- **Date**: July 2026
- **Reason**: Security rules require `request.auth.uid` to be populated. The custom Firestore-only auth system doesn't integrate with Firebase Auth, causing all Firestore security rules to fail.
- **Decision**: Use Firebase Auth Email/Password for authentication. Firestore stores only profile data (no passwords).
- **Consequences**: User document ID must equal Firebase Auth UID. No custom session management.

## ADR-002: One Conversation Per Facilitator/Student Pair
- **Status**: Accepted
- **Date**: Phase 4
- **Reason**: Conversation history should persist across multiple appointments between the same facilitator and student.
- **Decision**: Create one long-lived conversation per facilitator/student pair. Conversation ID is sorted participant IDs joined with underscore.
- **Consequences**: Conversations are reused, not recreated for each appointment.

## ADR-003: Messaging Unlocked After Accepted Appointment
- **Status**: Accepted
- **Date**: Phase 4
- **Reason**: Students shouldn't be able to freely message any facilitator. Messaging should be tied to an established relationship.
- **Decision**: Conversation is created when a facilitator accepts an appointment request.
- **Consequences**: Students can only message facilitators they have appointments with.

## ADR-004: Availability Computed Dynamically
- **Status**: Accepted
- **Date**: Phase 4.1
- **Reason**: Storing availability as static slots would lead to stale data when work hours change.
- **Decision**: Slots are generated dynamically from work hours, not stored permanently.
- **Consequences**: No need to update slots when work hours change.

## ADR-005: Work Hour Changes Don't Modify Existing Appointments
- **Status**: Accepted
- **Date**: Phase 4.1
- **Reason**: Appointments represent agreements between student and facilitator. Changing work hours shouldn't invalidate existing appointments.
- **Decision**: Existing appointments remain valid after work hour changes.
- **Consequences**: Students and facilitators keep their scheduled appointments.

## ADR-006: Risk Alerts Generated After Assessment Submission
- **Status**: Accepted
- **Date**: Phase 3
- **Reason**: Automatic detection of at-risk students is critical for safety.
- **Decision**: Risk evaluation runs on every submitted attempt. If thresholds are exceeded, a risk alert is created.
- **Consequences**: Facilitators are notified of at-risk students immediately.

## ADR-007: Slot-Based Appointment Booking
- **Status**: Accepted
- **Date**: Phase 4.1
- **Reason**: Prevent double-booking of time slots.
- **Decision**: Slots are reserved before appointment creation. Status changes from 'available' to 'reserved' to 'completed'/'cancelled'.
- **Consequences**: No two appointments can be booked for the same slot.

## ADR-008: No Support-Request Workflow
- **Status**: Accepted
- **Date**: Phase 4
- **Reason**: Students should be able to book appointments directly with available facilitators.
- **Decision**: No support-request system. Students can book with any active facilitator.
- **Consequences**: Simpler workflow, no pending request state.

## ADR-009: Assessment Screening-Only
- **Status**: Accepted
- **Date**: Phase 3
- **Reason**: SPARTAN-G is a screening tool, not a diagnostic or treatment platform.
- **Decision**: Assessment scores are informational only. No treatment functionality.
- **Consequences**: Scores trigger risk alerts but don't provide clinical recommendations.

## ADR-010: Role-Based Access Control
- **Status**: Accepted
- **Date**: Phase 1
- **Reason**: Different user types need different permissions.
- **Decision**: Implement RBAC with PERMISSIONS constants and ROLE_PERMISSIONS mapping.
- **Consequences**: Services check permissions before operations. Firestore rules enforce access.

## ADR-011: Shared Services Architecture
- **Status**: Accepted
- **Date**: Phase 1
- **Reason**: Mobile app will share the same backend logic.
- **Decision**: Services live in `packages/shared-services/` to be shared between web and mobile.
- **Consequences**: Web app imports from shared-services. No service duplication.

## ADR-012: Firestore Security Rules for All Access
- **Status**: Accepted
- **Date**: Phase 1
- **Reason**: Client-side code can be compromised. Security must be enforced at the database level.
- **Decision**: All Firestore access goes through security rules. No client-side filtering for sensitive data.
- **Consequences**: Rules use `request.auth.uid` and `userDoc().data.role` for access control.

## ADR-013: Assessment Attempts Stored Separately
- **Status**: Accepted
- **Date**: Phase 3
- **Reason**: Need to track submission history and allow multiple attempts.
- **Decision**: Assessment attempts stored in separate `assessment_attempts` collection.
- **Consequences**: Each submission is a separate document with its own risk metadata.

## ADR-014: Risk Metadata on Both Attempt and Alert
- **Status**: Accepted
- **Date**: Phase 3
- **Reason**: Need to show risk history and current alert status.
- **Decision**: Store `overallRiskScore`, `overallRiskLevel`, and `riskFlags` on both `AssessmentAttemptDocument` and `RiskAlertDocument`.
- **Consequences**: Risk history is preserved even if alerts are resolved.

## ADR-015: No Password Storage in Firestore
- **Status**: Accepted
- **Date**: Phase 5 (Authentication Migration)
- **Reason**: Passwords should be handled by Firebase Auth, not stored in Firestore.
- **Decision**: User documents contain no password field. Authentication is handled entirely by Firebase Auth.
- **Consequences**: User documents only contain profile data (displayName, role, isActive).