import { View, Text, StyleSheet } from 'react-native';
import { lightColors } from '@spartan-g/shared-ui';
import { useAuthStore } from '@spartan-g/shared-services';

/** Shown when a super_admin authenticates on mobile — web portal only */
export function WebOnlyScreen() {
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Web Portal Required</Text>
      <Text style={styles.body}>
        Super Admin access is available on the web portal only. Please visit the SPARTAN-G admin
        portal in your browser.
      </Text>
      <Text style={styles.link} onPress={() => signOut()}>
        Sign out
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: lightColors.background,
    gap: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: lightColors.text },
  body: { fontSize: 16, color: lightColors.textSecondary, textAlign: 'center', lineHeight: 24 },
  link: { fontSize: 16, color: lightColors.primary, fontWeight: '600' },
});
