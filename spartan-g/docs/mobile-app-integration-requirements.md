# Mobile App Integration Requirements

## Overview

This document outlines the requirements for a mobile application (React Native/Expo) that will share the same backend services as the SPARTAN-G web application. The mobile app will use the same Firebase backend and shared services.

---

## 1. Shared Architecture

### 1.1 Common Backend Services

Both web and mobile apps will use the same shared services from `packages/shared-services/`:

| Service | Purpose | Mobile Support |
|---------|---------|--------------|
| `auth.service.ts` | Firebase Authentication | ✅ Full support |
| `user.service.ts` | User profile management | ✅ Full support |
| `assessment.service.ts` | Assessment templates & questions | ✅ Full support |
| `assessment-response.service.ts` | Assessment submissions | ✅ Full support |
| `risk-alert.service.ts` | Risk detection & alerts | ✅ Full support |
| `appointment.service.ts` | Appointment management | ✅ Full support |
| `appointment-slot.service.ts` | Slot-based booking | ✅ Full support |
| `work-hours.service.ts` | Facilitator availability | ✅ Full support |
| `messaging.service.ts` | Messaging between users | ✅ Full support |
| `facilitator-student-link.service.ts` | Student-facilitator relationships | ✅ Full support |

### 1.2 Shared Types

Both apps use `packages/shared-types/` for type definitions:

- `auth.types.ts` - Authentication types
- `user.types.ts` - User profile types
- `assessment.types.ts` - Assessment types
- `firestore.types.ts` - Firestore document types
- `constants/roles.ts` - Role definitions
- `constants/platforms.ts` - Platform constants

---

## 2. Authentication Synchronization

### 2.1 Firebase Auth Integration

The mobile app will use the same Firebase Authentication system:

```typescript
// Mobile app will use the same auth functions
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from 'firebase/auth';
```

### 2.2 Session Management

- Use `onAuthStateChanged` for session persistence
- No localStorage - use AsyncStorage or SecureStore
- Same user document structure (`users/{firebaseUid}`)

### 2.3 Platform Context

The `PlatformContext` type in shared-types allows tracking:

```typescript
interface PlatformContext {
  platform: 'web' | 'ios' | 'android';
  deploymentTarget: 'development' | 'staging' | 'production';
}
```

---

## 3. Core Features (Shared)

### 3.1 Authentication Features

| Feature | Web Status | Mobile Status | Notes |
|---------|------------|---------------|-------|
| Email/Password Login | ✅ Complete | 🟡 Planned | Same Firebase Auth |
| Registration | ✅ Complete | 🟡 Planned | Same flow |
| Password Reset | ✅ Complete | 🟡 Planned | Same `sendPasswordResetEmail` |
| Session Persistence | ✅ Complete | 🟡 Planned | Use SecureStore on mobile |
| Role-based Access | ✅ Complete | 🟡 Planned | Same Firestore rules |

### 3.2 Student Features

| Feature | Web Status | Mobile Status | Notes |
|---------|------------|---------------|-------|
| View Appointments | ✅ Complete | 🟡 Planned | Same service |
| Book Appointment | ✅ Complete | 🟡 Planned | Same slot-based system |
| Take Assessments | ✅ Complete | 🟡 Planned | Same templates |
| View Risk Alerts | ✅ Complete | 🟡 Planned | Same service |
| Send Messages | ✅ Complete | 🟡 Planned | Same conversation model |

### 3.3 Facilitator Features

| Feature | Web Status | Mobile Status | Notes |
|---------|------------|---------------|-------|
| Manage Students | ✅ Complete | 🟡 Planned | Same service |
| View Appointments | ✅ Complete | 🟡 Planned | Same service |
| Set Work Hours | ✅ Complete | 🟡 Planned | Same service |
| View Risk Alerts | ✅ Complete | 🟡 Planned | Same service |
| Send Messages | ✅ Complete | 🟡 Planned | Same service |

### 3.4 Super Admin Features

| Feature | Web Status | Mobile Status | Notes |
|---------|------------|---------------|-------|
| Manage Users | ⏳ Planned | ⏳ Planned | Same service |
| Manage Templates | ✅ Complete | ⏳ Planned | Same service |
| View All Appointments | ⏳ Planned | ⏳ Planned | Same service |

---

## 4. Data Models

### 4.1 User Document

```typescript
interface UserDocument {
  uid: string;           // Firebase Auth UID
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 4.2 Profile Document

```typescript
interface ProfileDocument {
  uid: string;
  bio?: string;
  phone?: string;
  institution?: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
  updatedAt: Timestamp;
}
```

### 4.3 Device Token Document

```typescript
interface DeviceTokenDocument {
  uid: string;
  token: string;
  platform: 'ios' | 'android' | 'web';
  deploymentTarget: DeploymentTarget;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 5. Real-time Features

### 5.1 Messaging

- Same conversation model (one per facilitator/student pair)
- Real-time updates via Firestore listeners
- Push notifications via Firebase Cloud Messaging

### 5.2 Notifications

- Firestore `notifications` collection
- Push notifications for:
  - New messages
  - Appointment updates
  - Risk alerts
  - Assessment reminders

### 5.3 Presence

- Track user online status
- Last seen timestamps
- Typing indicators (optional)

---

## 6. Mobile-Specific Considerations

### 6.1 Offline Support

- Cache user profile locally
- Cache assessment templates
- Queue messages for offline sending
- Use Firestore offline persistence

### 6.2 Push Notifications

- Firebase Cloud Messaging integration
- Device token registration
- Notification handling in background/foreground

### 6.3 Native Features

- Camera for profile photos
- File picker for document uploads
- Biometric authentication (optional)
- Deep linking for password reset

### 6.4 Platform Differences

| Feature | Web | Mobile |
|---------|-----|--------|
| Storage | localStorage | SecureStore/AsyncStorage |
| Push | N/A | FCM |
| Camera | File input | expo-camera |
| Network | Online only | Offline support |

---

## 7. API Compatibility

### 7.1 No Breaking Changes

The mobile app will use the same service methods:

```typescript
// Example: Assessment service
const templates = await assessmentTemplateService.listPublished();
const attempt = await assessmentService.startAttempt(userId, templateId);
const response = await assessmentResponseService.submitResponse(attemptId, answers);
```

### 7.2 Platform-Aware Services

Services can be extended to handle platform-specific logic:

```typescript
// Example: Notification service
async sendNotification(
  userId: string,
  title: string,
  body: string,
  platform: Platform
) {
  // Send to web (in-app) or mobile (push)
}
```

---

## 8. Testing Strategy

### 8.1 Shared Test Suite

- Use same Firestore rules for both platforms
- Test with Firebase Auth users
- Verify role-based access works on both

### 8.2 Platform-Specific Tests

- Mobile: Test offline behavior, push notifications
- Web: Test responsive design, browser compatibility

---

## 9. Deployment

### 9.1 App Stores

- iOS: App Store
- Android: Google Play Store
- Web: Firebase Hosting

### 9.2 Environment Configuration

```
# .env (shared)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
# Mobile will use app.config.js with same values
```

---

## 10. Next Steps

### 10.1 Immediate Actions

- [ ] Set up Expo project
- [ ] Configure Firebase for mobile
- [ ] Implement authentication screens
- [ ] Test shared services integration

### 10.2 Future Enhancements

- [ ] Push notifications
- [ ] Offline support
- [ ] Biometric authentication
- [ ] Deep linking
- [ ] App store deployment