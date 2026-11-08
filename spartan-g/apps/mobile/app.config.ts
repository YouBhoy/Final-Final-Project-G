import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SPARTAN-G',
  slug: 'spartan-g-mobile',
  owner: 'just8ns-team',
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
  extra: {
    ...config.extra,
    eas: {
      projectId: '1d7d33b2-e60a-4c12-a276-e4d51353ed37',
    },
  },
});
