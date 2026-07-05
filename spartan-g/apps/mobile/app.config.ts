import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SPARTAN-G',
  slug: 'spartan-g-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'spartan-g',
  userInterfaceStyle: 'automatic',
  owner: 'just8ns-team',
  splash: {
    resizeMode: 'contain',
    backgroundColor: '#0F172A',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.spartang.mobile',
  },
  android: {
    adaptiveIcon: { backgroundColor: '#0F172A' },
    package: 'com.spartang.mobile',
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  plugins: [
    [
      'expo-build-properties',
      {
        android: {
          kotlinVersion: '1.9.25',
        },
      },
    ],
    [
      'expo-notifications',
      { color: '#DC2626' },
    ],
  ],
  extra: {
    eas: {
      projectId: '1d7d33b2-e60a-4c12-a276-e4d51353ed37',
    },
  },
});