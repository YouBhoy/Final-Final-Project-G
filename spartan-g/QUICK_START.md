# Quick Start: Testing Your App Updates

## Option 1: Use Web App (FASTEST - Recommended)

The web app works instantly with no setup:

```bash
# In a NEW terminal (keep the other one running)
cd spartan-g
npm run web
```

Then open browser to `http://localhost:5173`

**This is the fastest way to test your updates.**

---

## Option 2: Switch to Expo Go (Mobile)

Your Expo server is already running in tunnel mode. Here's what to do:

### **Step 1: Switch to Expo Go Mode**

In the terminal where Expo is running, press:
```
s
```

This switches from "development build" mode to "Expo Go" mode.

### **Step 2: Scan the New QR Code**

After pressing `s`, a new QR code appears. Scan it with:
- **Expo Go** app (download from App Store/Play Store if needed)

### **Step 3: If QR Still Doesn't Work**

**Manual connection:**
1. Open Expo Go app
2. Tap "Enter URL manually"
3. Type: `https://mzhsfs0-kalbs-8082.exp.direct`

---

## Current Status

✅ **Expo tunnel server is running** on port 8082
✅ **Tunnel connected** (no firewall issues)
⚠️ **Currently in development build mode** (press `s` to switch to Expo Go)

---

## Why QR Code Didn't Work

Your project has `expo-dev-client` installed. This makes Expo show a QR code for a **development build** instead of regular Expo Go. Regular Expo Go can't scan development build QR codes.

**Solution**: Press `s` to switch to Expo Go mode.

---

## Testing Your Updates

### **In Web App:**
1. Make code changes
2. Save file
3. Browser auto-refreshes
4. Test immediately

### **In Expo Go:**
1. Make code changes
2. Save file
3. Expo Go auto-reloads (shake phone for menu)
4. Test on device

---

## Common Issues

**"Expo Go says 'Cannot connect to server'"**
- Make sure you pressed `s` to switch to Expo Go mode
- Use tunnel URL instead of QR code
- Or use web app instead

**"App crashes on launch"**
- Check `.env` file exists in `apps/mobile/`
- Test web app first to verify Firebase works
- Check terminal for error messages

**"Changes not showing up"**
- Press `r` in Expo terminal to reload
- Or shake phone → Reload
- Clear cache: `npx expo start -c`

---

## Recommended Workflow

```
1. Make code changes
   ↓
2. Test in web app (instant)
   cd spartan-g && npm run web
   ↓
3. If mobile-specific, test in Expo Go
   - Press 's' in Expo terminal
   - Scan QR or enter URL manually
   ↓
4. Only build app for final testing
   eas build --profile development --platform ios
```

---

## Quick Commands Reference

```bash
# Web app (instant, recommended)
npm run web

# Mobile with Expo Go (instant)
npx expo start --tunnel
# Then press 's' to switch to Expo Go

# Development build (2-5 min, native features)
eas build --profile development --platform ios

# Production build (10-15 min, final testing)
eas build --profile production --platform ios
```

---

## Need Help?

- Check `TROUBLESHOOTING_QR.md` for detailed solutions
- Use web app if mobile testing fails - it has all the same features
- Expo docs: https://docs.expo.dev/get-started/expo-go/