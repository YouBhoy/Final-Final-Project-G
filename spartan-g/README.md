# SPARTAN-G

Multi-platform learning platform monorepo — React Native (Expo) + React Web + Firebase.

## Platforms

| Platform | App | Command |
|----------|-----|---------|
| Student Mobile | `apps/mobile` | `npm run mobile` |
| Student Web | `apps/web` | `npm run web` |
| Facilitator Mobile | `apps/mobile` | `npm run mobile` |
| Facilitator Web | `apps/web` | `npm run web` |
| Super Admin Web | `apps/web` | `npm run web` |

## Monorepo Layout

```
spartan-g/
├── apps/
│   ├── mobile/              # Expo — Student + Facilitator
│   └── web/                 # Vite React — all web portals
├── packages/
│   ├── shared-types/        # Types, schemas, RBAC
│   ├── shared-services/     # Firebase, repos, services, store
│   └── shared-ui/           # Theme tokens, guards
└── firebase/                # Security rules
```

## Quick Start

```bash
npm install
cp .env.example apps/mobile/.env
cp .env.example apps/web/.env
# Fill in Firebase credentials
npm run mobile   # or npm run web
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Firebase

```bash
firebase deploy --only firestore:rules,storage
```
