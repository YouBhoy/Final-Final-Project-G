# Troubleshooting: QR Code Not Working in Expo Go

## Issue
When scanning the QR code with Expo Go, nothing happens or the app doesn't load.

## Common Causes & Solutions

### **1. Network Issues (Most Common)**

**Problem**: Phone and computer not on the same network.

**Solution**:
- Ensure both devices are on the **same WiFi network**
- Try disabling VPN on both devices
- Restart your router if needed
- Turn off mobile data on your phone (use WiFi only)

### **2. Firewall/Antivirus Blocking**

**Problem**: Windows Firewall or antivirus blocking the connection.

**Solution**:
```bash
# Try starting Expo with tunnel mode instead
cd spartan-g/apps/mobile
npx expo start --tunnel
```

Or add firewall exception for:
- Node.js
- Expo CLI
- Port 19000-19001

### **3. Wrong Expo Go Version**

**Problem**: Expo Go app version incompatible with Expo SDK 52.

**Solution**:
- Update Expo Go to the latest version from App Store/Play Store
- Or use Expo Go's "Legacy" version if you're using older SDK

### **4. App Crashes on Launch**

**Problem**: App loads but crashes immediately due to missing config.

**Check these files**:

**a. Verify `app.config.ts` has scheme:**
```typescript
scheme: 'spartan-g',  // This must be present
```

**b. Check `.env` file exists:**
```bash
cd spartan-g/apps/mobile
ls -la .env
```

**c. Ensure Firebase credentials are valid:**
```bash
# Test in browser first
npm run web
# Check if Firebase connects properly
```

### **5. Try Different Connection Methods**

**Method 1: Tunnel (Most Reliable)**
```bash
cd spartan-g/apps/mobile
npx expo start --tunnel
```
- Slower but works across different networks
- No firewall issues

**Method 2: LAN**
```bash
cd spartan-g/apps/mobile
npx expo start --lan
```
- Faster but requires same network
- May have firewall issues

**Method 3: Local**
```bash
cd spartan-g/apps/mobile
npx expo start --localhost
```
- Only works on same device (simulator/emulator)

### **6. Manual Connection (If QR Still Fails)**

**Instead of scanning QR code:**

1. Open Expo Go app on your phone
2. Tap "Enter URL manually"
3. Type the URL shown in terminal (e.g., `exp://192.168.1.5:19000`)
4. Or use tunnel URL (e.g., `exp://exp.host/@username/spartan-g-mobile`)

### **7. Clear Cache and Restart**

```bash
cd spartan-g/apps/mobile

# Clear Expo cache
npx expo start -c

# Or clear npm cache
npm start -- --reset-cache
```

### **8. Check Terminal Output**

Look for errors in terminal when you scan:
- "Could not connect to server"
- "App crashed"
- "Missing native module"

Common errors:
- **"expo-dev-client not found"**: Run `npx expo install expo-dev-client`
- **"Firebase not initialized"**: Check `.env` file exists and has valid keys
- **"Metro bundler failed"**: Run `npx expo start -c`

### **9. Android-Specific Issues**

If using Android:
```bash
# Enable USB debugging
# Connect phone via USB
cd spartan-g/apps/mobile
npx expo start --android
```

### **10. iOS-Specific Issues**

If using iOS:
```bash
# Ensure you have Expo Go from App Store
# For iOS 14.5+, you may need to allow Expo Go in Settings
Settings → Privacy → Local Network → Enable Expo Go
```

## Step-by-Step Debugging

**Step 1: Test web app first**
```bash
cd spartan-g
npm run web
```
Does it work in browser? If not, fix Firebase/credentials first.

**Step 2: Test Expo Go connection**
```bash
cd spartan-g/apps/mobile
npx expo start --tunnel
```
Use tunnel mode (most reliable).

**Step 3: Manual connection**
- Don't scan QR
- Manually enter URL in Expo Go
- Check if connection works

**Step 4: Check device logs**
- Android: `adb logcat | grep ReactNative`
- iOS: Xcode → Devices → View Device Logs

## Quick Fixes to Try

```bash
# 1. Restart everything
cd spartan-g/apps/mobile
npx expo start -c

# 2. Use tunnel mode
npx expo start --tunnel

# 3. Reinstall Expo Go
# Delete app from phone and reinstall from store

# 4. Check network
ping your-computer-ip-from-phone

# 5. Try different port
npx expo start --port 8081
```

## If All Else Fails: Use Web App

If you can't get Expo Go working, remember:

**The web app has all the same features:**
```bash
cd spartan-g
npm run web
```

- Instant testing
- All business logic works
- Firebase connects
- Same data as mobile
- Zero setup issues

**Recommendation**: Use web app for development, only use mobile when you absolutely need device-specific features.

## Additional Resources

- Expo Go troubleshooting: https://docs.expo.dev/get-started/expo-go/
- Connection issues: https://docs.expo.dev/workflow/expo-go/#connection-issues
- Still stuck? Check Expo Discord: https://chat.expo.dev/