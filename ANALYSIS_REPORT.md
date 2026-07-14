# SPARTAN-G — Technology Stack Analysis

## Project Overview
A multi-platform learning platform with role-based access control (Student, Facilitator, Super Admin), served across web and mobile (iOS/Android).

---

## 1. Monorepo Management

| Technology | Details |
|------------|---------|
| **Package Manager** | npm workspaces |
| **TypeScript** | ~5.3.0 (shared across all packages) |
| **Root Package** | `spartan-g` — orchestrates `apps/*` and `packages/*` |

---

## 2. Frontend — Web App (`@spartan-g/web`)

| Category | Technology | Version |
|----------|-----------|---------|
| **Framework** | React | ^18.3.1 |
| **Build Tool** | Vite | ^5.4.21 |
| **Vite Plugin** | @vitejs/plugin-react | ^4.7.0 |
| **CSS Framework** | Tailwind CSS | ^4.3.1 |
| **Routing** | react-router-dom | ^6.30.4 |
| **Port** | 5173 (dev server) |

**Target Users:** Student, Facilitator, Super Admin

---

## 3. Frontend — Mobile App (`@spartan-g/mobile`)

| Category | Technology | Version |
|----------|-----------|---------|
| **Framework** | Expo | ~52.0.0 |
| **UI Runtime** | React Native | 0.76.5 |
| **Navigation** | @react-navigation/native | ^7.0.14 |
| **Bottom Tabs** | @react-navigation/bottom-tabs | ^7.2.0 |
| **Native Stack** | @react-navigation/native-stack | ^7.0.14 |
| **Push Notifications** | expo-notifications | ~0.29.0 |
| **Status Bar** | expo-status-bar | ~2.0.0 |

**Target Users:** Student, Facilitator (Super Admin is web-only)

---

## 4. Backend / Database / Infrastructure

| Category | Technology | Details |
|----------|-----------|---------|
| **Database** | Firebase Firestore (NoSQL) | Real-time document DB, security rules defined |
| **Authentication** | Firebase Auth | Email/password & identity management |
| **File Storage** | Firebase Storage | Rules defined in `firebase/storage.rules` |
| **Push Messaging** | Firebase Cloud Messaging (FCM) | Cross-platform push notifications |
| **Firebase SDK** | firebase | ^11.0.0 |

---

## 5. Shared Packages

### `@spartan-g/shared-types`
- Domain types, interfaces, and Firestore document schemas
- Role-Based Access Control (RBAC) definitions and platform access matrix
- Navigation type definitions (mobile + web route params)
- Utility functions: validators, scoring algorithms, risk evaluation

### `@spartan-g/shared-services`
- **Firebase SDK initialization** — `getFirebaseApp()` singleton via `firebase/app.ts`
- **Repository Layer** — `BaseRepository` + concrete repos (e.g., `user.repository.ts`, `assessment.repository.ts`)
- **Business Services** — Auth, user management, appointments, assessments, messaging, risk alerts, work hours
- **State Management** — **Zustand v5** (`useAuthStore`, `useAppStore`)
- **Messaging Adapter Interface** — Platform-injected (Expo for mobile, Firebase Web SDK for web)

### `@spartan-g/shared-ui`
- Design tokens (colors, typography, spacing)
- `createTheme()` factory function
- Cross-platform role guard logic

---

## 6. State Management

| Tool | Version | Usage |
|------|---------|-------|
| **Zustand** | ^5.0.0 | Lightweight, global state management (`auth.store.ts`, `app.store.ts`) |

---

## 7. Push Notification Architecture

| Platform | Adapter | Technology |
|----------|---------|------------|
| **Mobile** | `expo-messaging.adapter.ts` | Expo Notifications |
| **Web** | `web-messaging.adapter.ts` | Firebase Cloud Messaging Web SDK |
| **Token Storage** | `device_tokens` collection in Firestore | Tagged with `deploymentTarget` |

---

## 8. Environment & Config Management

| System | Prefix | Purpose |
|--------|--------|---------|
| **Web (.env)** | `VITE_*` (e.g., `VITE_FIREBASE_API_KEY`) | Vite-exposed env vars |
| **Mobile (.env)** | `EXPO_PUBLIC_*` (e.g., `EXPO_PUBLIC_FIREBASE_API_KEY`) | Expo-exposed env vars |
| **Deployment Targeting** | `shared-services/src/config/` | Env resolution per platform (web vs native) |

---

## 9. CI/CD & Deployment

| Service | Details |
|---------|---------|
| **EAS Build** (Expo) | Project ID: `1d7d33b2-e60a-4c12-a276-e4d51353ed37` |
| **iOS Bundle ID** | `com.spartang.mobile` |
| **Android Package** | `com.spartang.mobile` |
| **Firebase Hosting** | Configured via `.firebaserc` + `firebase.json` (supports potential hosting) |

---

## 10. Firestore Collections (Data Model)

| Collection | Purpose |
|------------|---------|
| `users` | Auth-linked user records with role |
| `profiles` | Extended profile data |
| `courses` | Course catalog |
| `enrollments` | Student-course relationships |
| `assignments` | Course assignments |
| `submissions` | Student submissions |
| `notifications` | In-app + push notifications |
| `device_tokens` | FCM tokens per deployment target |
| `risk_alerts` | Facilitator risk alerts |
| `appointments` | Scheduled appointments |
| `conversations` | Messaging threads |
| `messages` | Individual messages |
| `work_hours_schedules` | Facilitator work hours |
| `announcements` | Platform announcements |
| `audit_logs` | Admin audit trail |

---

## Summary Diagram

```
┌─ Frontend ─────────────────────────────────────────────────┐
│                                                             │
│  Web App (React 18 + Vite 5 + Tailwind 4)                  │
│  Mobile App (Expo 52 + React Native 0.76)                  │
│                                                             │
├─ Shared Packages ──────────────────────────────────────────┤
│                                                             │
│  shared-types        shared-services      shared-ui         │
│  (types, RBAC)       (Firebase, repos,    (themes, tokens) │
│                       Zustand store)                        │
│                                                             │
├─ Backend / Infrastructure ─────────────────────────────────┤
│                                                             │
│  Firebase Auth  →  Firestore DB  →  Firebase Storage       │
│                                     Firebase Cloud Messaging│
└────────────────────────────────────────────────────────────┘
```

## Key Technologies (Concise List)

| Layer | Primary Tech |
|-------|-------------|
| **Programming Language** | TypeScript (~5.3.0) |
| **Web Framework** | React 18 + Vite 5 + Tailwind CSS 4 |
| **Mobile Framework** | Expo 52 + React Native 0.76 |
| **State Management** | Zustand 5 |
| **Backend** | Firebase (Auth, Firestore, Storage, FCM) |
| **Routing (Web)** | React Router DOM 6 |
| **Routing (Mobile)** | React Navigation 7 |
| **Build/CI** | Vite (web), EAS Build (mobile) |
| **Monorepo** | npm workspaces |