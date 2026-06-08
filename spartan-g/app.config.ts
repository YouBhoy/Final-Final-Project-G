import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SPARTAN-G',
  slug: 'spartan-g',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'spartan-g',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    resizeMode: 'contain',
    backgroundColor: '#0F172A',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.spartang.app',
    googleServicesFile: './GoogleService-Info.plist',
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0F172A',
    },
    package: 'com.spartang.app',
    googleServicesFile: './google-services.json',
  },
  plugins: [
    'expo-secure-store',
    [
      'expo-notifications',
      {
        color: '#DC2626',
      },
    ],
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    },
  },
});
