# Running SPARTAN-G in Emulators

Yes! You can run the mobile app in emulators instead of building with EAS.

## Option 1: Expo Go in Emulator (FASTEST)

### Android Emulator

```bash
cd spartan-g/apps/mobile
npx expo start --android
```

**Setup:**
1. Install Android Studio
2. Create Android Virtual Device (AVD)
3. Enable USB debugging
4. Run the command above

**Note:** Press `s` in the Expo terminal to switch to Expo Go mode first.

### iOS Simulator (macOS only)

```bash
cd spartan-g/apps/mobile
npx expo start --ios
```

**Setup:**
1. Install Xcode from App Store
2. Install Xcode Command Line Tools
3. Open simulator: `open -a Simulator`
4. Run the command above

---

## Option 2: Development Build in Emulator (Native Features)

If you need native features (camera, biometrics, etc.):

### Build for Emulator

```bash
cd spartan-g/apps/mobile

# Android emulator
eas build --profile development --platform android --local

# iOS simulator (macOS only)
eas build --profile development --platform ios --simulator
```

**OR** use Expo's local build:
```bash
npx expo run:android
npx expo run:ios
```

---

## Option 3: Web App (RECOMMENDED for Development)

The web app works in any browser:

```bash
cd spartan-g
npm run web
```

Open `http://localhost:5173` - no emulator needed!

---

## Recommended Setup

### For Windows Users (No iOS possible)

**Use Android Emulator:**
1. Install Android Studio
2. Create AVD (Android 13+ recommended)
3. Start emulator
4. Run: `npx expo start --android`

**OR use Web App:**
- Much faster
- All features work
- No emulator overhead

### For macOS Users

**Use iOS Simulator:**
1. Install Xcode
2. Run: `npx expo start --ios`

**OR use Web App:**
- Fastest option
- All business logic works

---

## Emulator Setup Guides

### Android Studio Setup

1. **Download Android Studio**
   - https://developer.android.com/studio

2. **Install during setup:**
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device

3. **Create Virtual Device:**
   - Open Android Studio → Device Manager
   - Create Device → Choose phone (Pixel 5 recommended)
   - Select API 34 (Android 14)
   - Finish

4. **Start Emulator:**
   - Device Manager → Play button
   - Wait for boot (2-3 minutes)

5. **Run SPARTAN-G:**
   ```bash
   cd spartan-g/apps/mobile
   npx expo start --android
   ```

### iOS Simulator Setup (macOS only)

1. **Install Xcode:**
   ```bash
   # From App Store
   # Or: sudo xcode-select --install
   ```

2. **Open Simulator:**
   ```bash
   open -a Simulator
   # Or: xcrun simctl list
   ```

3. **Run SPARTAN-G:**
   ```bash
   cd spartan-g/apps/mobile
   npx expo start --ios
   ```

---

## Comparison: Testing Options

| Method | Setup Time | Speed | Features | Cost |
|--------|-----------|-------|----------|------|
| Web App | 0 min | Instant | All | Free |
| Expo Go (real device) | 5 min | Instant | Expo SDK only | Free |
| Expo Go (emulator) | 30 min | Fast | Expo SDK only | Free |
| Dev Build (emulator) | 1 hour | Medium | All native | Free |
| EAS Build (device) | 0 min | 2-5 min | All native | ~3 credits |

---

## My Recommendation

**Use Web App for 90% of development:**
```bash
npm run web
```

**Only use emulator when:**
- Testing native features (camera, biometrics)
- UI doesn't look right in browser
- Final mobile testing before release

**Don't use EAS Build for development** - it's the slowest and costs credits.

---

## Quick Start: Android Emulator

```bash
# 1. Start Android emulator (from Android Studio)
# Wait for boot

# 2. In terminal:
cd spartan-g/apps/mobile
npx expo start --android

# 3. Press 's' to switch to Expo Go
# App installs automatically in emulator
```

## Quick Start: Web App

```bash
cd spartan-g
npm run web
# Open browser to localhost:5173
```

---

## Troubleshooting

**"Android emulator not found"**
- Start emulator first from Android Studio
- Or run: `emulator -list-avds` then `emulator -avd <name>`

**"iOS simulator not found"**
- Install Xcode
- Run: `sudo xcode-select --s /Applications/Xcode.app`

**"Expo Go not installing in emulator"**
- Make sure emulator has Google Play Services
- Use API 34+ emulator

**"App is slow in emulator"**
- Emulators are slower than real devices
- Use web app instead for faster testing

---

## Summary

**Best for development:** Web app (`npm run web`)
**Best for mobile testing:** Real device with Expo Go
**Best for native features:** Build with `eas build --profile development`
**Don't do:** Production builds for every test