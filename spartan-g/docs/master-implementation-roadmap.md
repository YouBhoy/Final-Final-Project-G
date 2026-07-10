# SPARTAN-G Master Implementation Roadmap

## 1. Architecture (Stable)

### Purpose
SPARTAN-G is a student wellbeing platform that connects students with facilitators for mental health support.

### Technology Stack
- **Frontend**: React + TypeScript (Vite) in `apps/web/`
- **Shared Services**: TypeScript services in `packages/shared-services/`
- **Shared Types**: TypeScript types in `packages/shared-types/`
- **Backend**: Firebase (Authentication, Firestore, Storage)
- **Deployment**: Firebase hosting

### Roles
| Role | Description |
|------|-------------|
| Student | Users seeking support |
| Facilitator | Support providers |
| Super Admin | Platform administrators |

### Database Collections
| Collection | Purpose |
|------------|---------|
| users | User profile data |
| profiles | Extended profile data |
| assessment_templates | Assessment definitions |
| assessment_questions | Questions for templates |
| assessment_attempts | Student assessment submissions |
| risk_alerts | At-risk student notifications |
| appointments | Student-facilitator sessions |
| appointment_slots | Available time slots |
| work_hours_schedules | Facilitator availability |
| conversations | Message threads |
| messages | Individual messages |
| facilitator_student_links | Student-facilitator relationships |
| notifications | User notifications (planned) |
| audit_logs | System audit trail (planned) |

### Architecture Rules
- Firebase Auth for authentication, Firestore for profile data only
- User document ID = Firebase Auth UID
- One conversation per facilitator/student pair
- Risk alerts generated after assessment submission
- Slot-based appointment booking
- Availability computed dynamically from work hours
- Existing appointments remain valid after work hour changes

---

## 2. Implementation Status

### Backend Services
| Service | Progress |
|---------|----------|
| authService | 🟡 15% (needs migration) |
| userService | ✅ 100% |
| assessmentTemplateService | ✅ 100% |
| assessmentService | ✅ 100% |
| assessmentResponseService | ✅ 100% |
| riskAlertService | ✅ 100% |
| appointmentService | ✅ 100% |
| appointmentSlotService | ✅ 100% |
| workHoursService | ✅ 100% |
| messagingService | ✅ 100% |
| facilitatorStudentLinkService | ✅ 100% |

### Frontend Portals
| Portal | Progress |
|--------|----------|
| Student Portal | 🟡 80% |
| Facilitator Portal | 🟡 85% |
| Super Admin Portal | 🟡 60% |

### Core Features
| Feature | Progress |
|---------|----------|
| Authentication | 🟡 15% (migration in progress) |
| Assessment Engine | ✅ 100% |
| Risk Detection | ✅ 100% |
| Messaging | ✅ 100% |
| Appointments | ✅ 100% |
| Work Hours | ✅ 100% |
| Scheduling | ✅ 100% |
| Timeline | ⏳ 0% |
| Analytics | ⏳ 0% |
| Resources | ⏳ 0% |
| Referrals | ⏳ 0% |
| Notifications | ⏳ 0% |

---

## 3. Phase Tracker

### Phase 1: Foundation
- ✅ Complete

### Phase 2: Assessment Engine
- ✅ Complete

### Phase 3: Risk Detection
- ✅ Complete

### Phase 4: Messaging & Appointments
- ✅ Complete

### Phase 5: Authentication Migration
- 🟡 In Progress
- 4.1: Core Firebase Auth - ⬜
- 4.2: Registration Flow - ⬜
- 4.3: Login Flow - ⬜
- 4.4: Session Management - ⬜
- 4.5: Forgot Password - ⬜
- 4.6: Cleanup - ⬜

### Phase 6: Student Timeline
- ⏳ Planned

### Phase 7: Super Admin
- ⏳ Planned

### Phase 8: Referrals
- ⏳ Planned

### Phase 9: Resources
- ⏳ Planned

### Phase 10: Notifications
- ⏳ Planned

### Phase 11: Analytics
- ⏳ Planned

---

## 4. Current Sprint

**Goal**: Complete Firebase Authentication Migration

**Remaining Tasks**:
- [ ] Replace `apps/web/src/lib/auth.ts` with Firebase Auth SDK
- [ ] Update `apps/web/src/hooks/useAuth.tsx` to use `onAuthStateChanged`
- [ ] Remove duplicate auth types
- [ ] Update LoginPage error handling
- [ ] Update RegisterPage registration flow
- [ ] Implement ForgotPasswordPage

**Definition of Done**:
- [ ] Users can register with email/password
- [ ] Users can login with email/password
- [ ] Users can logout
- [ ] Session persists on page refresh
- [ ] Password reset works
- [ ] Firestore security rules work (request.auth.uid populated)

---

## 5. Architecture Decisions (ADRs)

### ADR-001: Firebase Auth for Authentication
- **Status**: Accepted
- **Reason**: Security rules require `request.auth.uid` to be populated
- **Decision**: Use Firebase Auth Email/Password, Firestore for profile data only

### ADR-002: One Conversation Per Facilitator/Student Pair
- **Status**: Accepted
- **Reason**: Conversation history should persist across appointments
- **Decision**: Reuse conversations, ID is sorted participant IDs joined with underscore

### ADR-003: Messaging Unlocked After Accepted Appointment
- **Status**: Accepted
- **Reason**: Students shouldn't freely message facilitators
- **Decision**: Conversation created at appointment acceptance

### ADR-004: Availability Computed Dynamically
- **Status**: Accepted
- **Reason**: Avoid stale slots
- **Decision**: Slots generated from work hours, not stored permanently

### ADR-005: Work Hour Changes Don't Modify Existing Appointments
- **Status**: Accepted
- **Reason**: Appointments represent agreements
- **Decision**: Existing appointments remain valid after work hour changes

### ADR-006: Risk Alerts Generated After Assessment Submission
- **Status**: Accepted
- **Reason**: Automatic detection of at-risk students
- **Decision**: Evaluation runs on every submitted attempt, creates alert if thresholds exceeded

### ADR-007: Slot-Based Appointment Booking
- **Status**: Accepted
- **Reason**: Prevent double-booking
- **Decision**: Reserve slot before creating appointment

---

## 6. Project Completion

| Area | Progress |
|------|----------|
| Backend | 96% |
| Frontend | 82% |
| Authentication | 15% |
| Testing | 35% |
| Documentation | 90% |
| **Overall Project** | **≈78%** |

---

## 7. Context for Future Chats

**SPARTAN-G Project Context**

SPARTAN-G is a student wellbeing platform connecting students with facilitators for mental health support. Built with React (Vite) frontend, shared TypeScript services, and Firebase backend.

**Architecture:**
- Frontend: `apps/web/` (React SPA)
- Shared Services: `packages/shared-services/` (Firebase integration)
- Shared Types: `packages/shared-types/` (TypeScript types)
- Backend: Firebase (Auth, Firestore, Storage)

**Current Status:**
- Assessment Engine: ✅ Complete (PHQ-9, GAD-7, DASS-21)
- Risk Detection: ✅ Complete
- Messaging: ✅ Complete
- Appointments: ✅ Complete
- Work Hours: ✅ Complete
- Authentication: ⏳ **NEEDS MIGRATION** (custom Firestore auth → Firebase Auth)

**Critical Issue:**
The app uses a custom Firestore-only authentication system. Users are never authenticated through Firebase Auth, so `request.auth.uid` is always null in Firestore security rules, causing "Missing or insufficient permissions" errors.

**Next Task:**
Firebase Authentication Migration - Replace `apps/web/src/lib/auth.ts` with Firebase Auth SDK. This is the foundation for all other features.

**Key Files:**
- `apps/web/src/lib/auth.ts` - Custom auth (needs rewrite)
- `apps/web/src/hooks/useAuth.tsx` - Uses localStorage (needs update)
- `packages/shared-services/src/services/auth.service.ts` - Correct implementation (reference)
- `firebase/firestore.rules` - Already correct, will work after migration

**Roles:**
- Student: book appointments, take assessments, send messages
- Facilitator: manage students, appointments, risk alerts, work hours
- Super Admin: manage users, templates, platform settings

**Architecture Rules:**
- Firebase Auth for authentication, Firestore for profile data only
- User document ID = Firebase Auth UID
- One conversation per facilitator/student pair
- Risk alerts generated after assessment submission
- Slot-based appointment booking
- Availability computed dynamically from work hours