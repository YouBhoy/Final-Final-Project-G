# Running SPARTAN-G in Android Studio

## Important: This is an Expo Project

SPARTAN-G is an **Expo React Native** project, not a standard Android project. You **cannot** run it by clicking the green "Run" button in Android Studio.

Instead, you use **Expo CLI commands** in the terminal.

---

## Step-by-Step Guide

### **1. Open Terminal in Android Studio**

At the bottom of Android Studio, click the **"Terminal"** tab.

Or press `` Ctrl+` `` (backtick).

### **2. Navigate to the Mobile App Folder**

```bash
cd spartan-g/apps/mobile
```

### **3. Start an Emulator (if not already running)**

In Android Studio:
1. Click **Device Manager** (phone icon on right sidebar)
2. Create a virtual device if you haven't:
   - Click **"Create Device"**
   - Choose **Pixel 5** (or any phone)
   - Select **API 34** (Android 14) or **API 33**
   - Download the system image if needed
   - Click **Finish**
3. Start the emulator:
   - Click the **Play** button next to your device
   - Wait 2-3 minutes for boot

### **4. Run SPARTAN-G in Emulator**

In the Android Studio terminal:

```bash
npx expo start --android
```

**OR** if you want Expo Go mode (faster, no native features):
```bash
npx expo start
# Then press 's' to switch to Expo Go
# Then press 'a' to open in Android
```

### **5. What Happens**

1. Expo builds the app
2. Installs it in the emulator
3. Opens it automatically
4. Changes hot-reload as you edit code

---

## Alternative: Use Web App Instead

**Much easier** - no emulator needed:

```bash
# In Android Studio terminal
cd spartan-g
npm run web
```

Then open browser to `http://localhost:5173`

**This is recommended for development** - it's instant and has all features.

---

## If You Get Errors

### **"Expo not found"**
```bash
cd spartan-g
npm install
```

### **"Android SDK not found"**
1. In Android Studio: **File → Settings → Appearance & Behavior → System Settings → Android SDK**
2. Note the SDK path
3. Set environment variable:
   ```bash
   set ANDROID_HOME=C:\Users\admin\AppData\Local\Android\Sdk
   set PATH=%PATH%;%ANDROID_HOME%\platform-tools
   ```

### **"No emulator found"**
1. Start emulator first from Device Manager
2. Wait for full boot
3. Then run `npx expo start --android`

### **"ADB not found"**
```bash
# Add Android platform-tools to PATH
set PATH=%PATH%;C:\Users\admin\AppData\Local\Android\Sdk\platform-tools
```

---

## Recommended Workflow

**Don't use Android Studio for running the app.** Use it only for:
- Viewing logs
- Debugging native issues
- Managing emulators

**Run the app from terminal:**
```bash
# Web app (recommended)
cd spartan-g && npm run web

# OR Android emulator
cd spartan-g/apps/mobile && npx expo start --android
```

---

## Quick Commands for Android Studio Terminal

```bash
# Navigate to project
cd spartan-g

# Install dependencies (first time only)
npm install

# Run web app (recommended)
npm run web

# OR run in Android emulator
cd apps/mobile
npx expo start --android
```

---

## Why Not Use Android Studio's Run Button?

Android Studio expects a standard Android project with:
- `settings.gradle`
- `app/build.gradle`
- Native Java/Kotlin code

SPARTAN-G is an **Expo managed workflow** project:
- No native Android code
- Expo handles the build process
- Use Expo CLI, not Android Studio

---

## Summary

1. **Don't** click the green Run button
2. **Do** use the terminal in Android Studio
3. **Run** `npx expo start --android` from `spartan-g/apps/mobile`
4. **OR** use web app: `npm run web`

The web app is faster and easier for development.