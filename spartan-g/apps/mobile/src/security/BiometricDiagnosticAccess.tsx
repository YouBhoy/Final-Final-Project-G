import type { ReactNode } from 'react';
import { NativeModules, Pressable, Text, View } from 'react-native';

/** Visible only when the task-local native diagnostic overlay is compiled.
 * The viewer contains enum-only RAM traces, never account or storage values. */
export function BiometricDiagnosticAccess({ children }: { children: ReactNode }) {
  const bridge = NativeModules.SpartanBiometricDiagnostic;
  if (bridge?.enabled !== true) return children;
  return <View style={{ flex: 1 }}>{children}<Pressable accessibilityRole="button" accessibilityLabel="View biometric diagnostic trace" onPress={() => { void bridge.show().catch(() => {}); }} style={{ position: 'absolute', top: 42, right: 8, padding: 10, borderRadius: 12, backgroundColor: '#FFF3CD', borderWidth: 1, borderColor: '#856404', zIndex: 10000 }}><Text style={{ color: '#533F03', fontSize: 12 }}>v22 DIAGNOSTIC · Trace</Text></Pressable></View>;
}
