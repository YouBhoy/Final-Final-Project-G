# SPARTAN-G Development Workflow

## Problem Statement
Building the mobile app with EAS Build takes 5-15 minutes and costs credits every time you make changes or fix bugs.

## Solution: Emulate During Development

### **Primary Workflow: Use Web App (Recommended)**

The web app provides instant feedback with no rebuild required.

```bash
cd spartan-g
npm run web
```

Access portals at:
- Student: `http://localhost:5173/student/*`
- Facilitator: `http://localhost:5173/facilitator/*`
- Super Admin: `http://localhost:5173/admin/*`

**Benefits:**
- Changes appear instantly (hot reload)
- Test all business logic
- Debug with browser DevTools
- Zero build time/cost
- All features available

### **Secondary: Expo Go for Mobile UI Testing**

When you need to test mobile-specific UI or gestures:

```bash
cd spartan-g/apps/mobile
npx expo start
```

1. Install **Expo Go** app on your phone (iOS/Android)
2. Scan QR code from terminal
3. Changes hot-reload automatically
4. No build credits required

**Limitations:**
- Only works with Expo SDK APIs
- Cannot test custom native modules
- Some native features unavailable

### **Tertiary: Development Builds**

Only when you need native features not in Expo Go:

```bash
cd spartan-g/apps/mobile
eas build --profile development --platform ios
eas build --profile development --platform android
```

Install the build on your device. Supports custom native code but still faster than production builds.

## Recommended Daily Workflow

```
1. Make code changes
   ↓
2. Test in web app (npm run web)
   - Instant feedback
   - Verify business logic
   - Test services/repositories
   ↓
3. If UI issues, test in Expo Go
   - Quick mobile visual check
   - No build required
   ↓
4. Only build mobile for:
   - Device-specific features (camera, biometrics, notifications)
   - Performance testing
   - Final QA before release
```

## Feature Parity Check

The web and mobile apps share:
- `packages/shared-types` - TypeScript types
- `packages/shared-services` - Business logic, Firebase repos
- `packages/shared-ui` - UI components

Both platforms use the same Firebase backend and security rules.

## Cost Savings

| Method | Time | Credits | When to Use |
|--------|------|---------|-------------|
| Web app | 0s | 0 | 80% of development |
| Expo Go | 0s | 0 | Mobile UI checks |
| Dev build | 2-5 min | ~3 | Native features only |
| Production build | 10-15 min | ~10 | Final testing only |

## Quick Commands

```bash
# Web development (instant)
npm run web

# Mobile with Expo Go (instant)
npm run mobile

# Development build (fast)
cd apps/mobile && eas build --profile development --platform ios

# Production build (slow, use sparingly)
cd apps/mobile && eas build --profile production --platform ios
```

## Tips

1. **Develop in web first** - Faster iteration, easier debugging
2. **Use shared packages** - Logic is tested once, works everywhere
3. **Test services in web** - Firebase repos work identically
4. **Build mobile last** - Only for device-specific testing
5. **Use Expo Go frequently** - Quick visual validation

## Troubleshooting

**"But I need to test native features!"**
- Most features work in Expo Go
- Only build when absolutely necessary
- Consider if feature can be web-only

**"Web app is missing features!"**
- Check if feature exists in mobile-only code
- Consider porting to shared packages
- Web and mobile should share 90%+ code

**"Firebase isn't working in web app"**
- Ensure `apps/web/.env` has Firebase credentials
- Check browser console for errors
- Verify Firestore rules allow access