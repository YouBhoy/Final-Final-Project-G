# SPARTAN-G Mobile Setup Guide

This branch already includes the committed mobile config changes needed for Expo/EAS, Firebase, Kotlin, and push notifications. Teammates only need to recreate the ignored local files and make sure their Expo/EAS access is set up.

## 1) Files that are ignored and must be created locally

Create these files yourself after pulling the branch:

- `apps/mobile/.env`
- `apps/mobile/google-services.json`

The branch already includes the committed config files that reference them:

- `apps/mobile/app.config.ts`
- `apps/mobile/eas.json`

## 2) `apps/mobile/.env` contents

Use the same Firebase project values as `apps/web/.env`, but with Expo-prefixed names for mobile.

Create `apps/mobile/.env` with these keys:

```dotenv
EXPO_PUBLIC_FIREBASE_API_KEY=<copy from apps/web/.env>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<copy from apps/web/.env>
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<copy from apps/web/.env>
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=<copy from apps/web/.env>
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<copy from apps/web/.env>
EXPO_PUBLIC_FIREBASE_APP_ID=<copy from apps/web/.env>
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=<optional; can stay empty>
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_EAS_PROJECT_ID=1d7d33b2-e60a-4c12-a276-e4d51353ed37
```

Notes:

- The Firebase values should match the web app exactly. The source of truth is `apps/web/.env`.
- `EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID` is optional and may stay blank.
- Do not add web-only values like `VITE_FIREBASE_VAPID_KEY` to the mobile env file.
- If you need to share these values with a teammate, use a private direct message, a password manager, or another secure file-sharing method. Do not post them in a public channel.

## 3) `google-services.json`

You have two safe options.

Option A: download your own copy from Firebase Console.

- Go to Firebase Console.
- Open project `spartan-g-a2d80`.
- Open Project settings.
- Add the Android app with package name `com.spartang.mobile`.
- Download the generated `google-services.json`.

Option B: receive the file from another teammate.

- This file is safe to share within the team.
- It is project-identifying config, not a password or private login secret.
- Share it privately, not in a public channel.

Place the file at:

- `apps/mobile/google-services.json`

The current Expo config already points to that file locally, and EAS cloud builds can use the `GOOGLE_SERVICES_JSON` file variable instead.

## 4) Dependencies to install after pulling

Install from the repo root so the workspace dependencies are restored correctly:

```powershell
npm install
```

Today’s mobile setup adds these Expo packages if they are not already present in your install:

- `expo-dev-client`
- `expo-build-properties`

Do not install them inside `apps/mobile` manually unless you have a specific reason. The monorepo uses workspaces.

## 5) Config that is already handled by the branch

You do not need to recreate these manually if you pull the branch:

- `apps/mobile/app.config.ts` already references the local Firebase file fallback and the EAS file variable.
- `apps/mobile/app.config.ts` already includes `expo-notifications`.
- `apps/mobile/app.config.ts` already pins Android Kotlin to `1.9.25` via `expo-build-properties`.
- `apps/mobile/eas.json` already sets the `development` build profile and points it at the `development` EAS environment.

## 6) EAS account access

You need an Expo account, and for this project you also need access to the `just8ns-team` Expo/EAS organization.

If you do not already have access:

- Create or log into an Expo account at expo.dev.
- Ask an org owner to invite you to `just8ns-team` in the Expo dashboard.

The practical check from the terminal is:

```powershell
npx eas-cli whoami
```

If it says `Not logged in`, run:

```powershell
npx eas-cli login
```

If you are the maintainer and need to set the EAS environment variables once for the team, use the Expo dashboard or the EAS CLI.

For the string variables, a maintainer can sync the local `.env` file into the EAS `development` environment with:

```powershell
cd apps/mobile
npx eas-cli env:push development --path .env --force
```

For the `GOOGLE_SERVICES_JSON` file variable, the Expo dashboard is the simplest path:

- Expo dashboard → project `spartan-g-mobile` → Project settings → Environment variables
- Add a variable named `GOOGLE_SERVICES_JSON`
- Set type to `File`
- Set visibility to `Secret`
- Set environment to `development`
- Upload the `google-services.json` file

## 7) Build and run the app

### Start the dev server

From the repo root, you can use the workspace script:

```powershell
npm run mobile
```

Or from the mobile app folder:

```powershell
cd apps/mobile
npx expo start --dev-client
```

### Build a development client for Android

From `apps/mobile`:

```powershell
npx eas-cli build --profile development --platform android --clear-cache
```

That creates an Android development build in the cloud. You can install that APK on any compatible Android phone.

### Reuse vs rebuild

- An Android APK can usually be reused on another Android phone.
- An iPhone cannot use the Android APK; it needs its own iOS build.
- If a teammate’s phone is Android and compatible, they can usually install the same APK you already built.

## 8) How to connect the installed dev client to the local server

Once the APK is installed on the phone:

1. Run `npx expo start --dev-client` in `apps/mobile`.
2. Keep the phone and computer on the same Wi-Fi network.
3. Open the installed app on the phone and connect to the Metro server.

If same-Wi-Fi discovery is unreliable, use tunnel mode:

```powershell
npx expo start --dev-client --tunnel
```

## 9) First test to prove Firebase is really connected

1. Open the mobile app on a device.
2. Register a new test student account.
3. Open Firebase Console → project `spartan-g-a2d80` → Authentication → Users.
4. Confirm the new user appears there.

If the user appears in Firebase Auth, the mobile app is talking to the same Firebase backend as the web app.

## 10) Quick troubleshooting notes

- If you see `Missing required environment variable`, the mobile `.env` file is missing a key or the EAS environment is not populated.
- If Android build fails with a Kotlin/Compose compiler mismatch, this branch already pins Kotlin to `1.9.25` through `expo-build-properties`.
- If push token registration fails, confirm `EXPO_PUBLIC_EAS_PROJECT_ID` is set and the EAS `development` environment contains the `GOOGLE_SERVICES_JSON` file variable.
