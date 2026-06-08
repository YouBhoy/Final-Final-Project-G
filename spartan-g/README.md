# SPARTAN-G

Learning platform built with React Native (Expo), TypeScript, and Firebase.

## Quick Start

```bash
cd spartan-g
npm install
cp .env.example .env
# Fill in Firebase credentials in .env
npm start
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the complete system design.

## Firebase Setup

1. Create a Firebase project
2. Enable Authentication (Email/Password)
3. Create Firestore database
4. Enable Storage
5. Deploy security rules:

```bash
firebase deploy --only firestore:rules,storage
```

## Roles

- **student** — enroll, submit assignments
- **facilitator** — manage courses, grade submissions
- **super_admin** — full platform administration
