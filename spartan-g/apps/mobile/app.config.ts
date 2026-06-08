import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SPARTAN-G',
  slug: 'spartan-g-mobile',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'spartan-g',
  userInterfaceStyle: 'automatic',
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
  },
  plugins: [
    [
      'expo-notifications',
      { color: '#DC2626' },
    ],
  ],
});
