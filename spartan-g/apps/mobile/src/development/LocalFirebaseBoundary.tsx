import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { localEmulators } from '@spartan-g/shared-services/src/config/local-emulators';
import { validateLocalHealth } from '@spartan-g/shared-services/src/config/local-emulator-contract';
import { setLocalEmulatorsReady } from '@spartan-g/shared-services/src/firebase/local-emulator-state';
import { installLocalNetworkGuard } from './localNetworkGuard';
import { LocalGardenChecks } from './LocalGardenChecks';
import { installLocalGardenBackend } from './localGardenBackend';

export function LocalFirebaseBoundary({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('Checking local Auth, Firestore and Functions...');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!localEmulators.enabled) return;
    const local = localEmulators;
    installLocalNetworkGuard();
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 18000);
        try {
          const response = await fetch(`http://${local.host}:${local.healthPort}/health`, { signal: controller.signal });
          if (!response.ok) throw new Error(`Local emulator readiness returned HTTP ${response.status}.`);
          validateLocalHealth(await response.json());
        } finally { clearTimeout(timeout); }
        if (!active) return;
        setLocalEmulatorsReady(true);
        installLocalGardenBackend();
        setReady(true);
        timer = setTimeout(check, 2000);
      } catch (failure) {
        if (!active) return;
        setLocalEmulatorsReady(false);
        setReady(false);
        setError('Local Firebase unavailable. No production fallback. Start the isolated environment and retry.');
        console.warn('[LocalFirebase] Environment unavailable; application providers blocked.',
          failure instanceof Error ? { name: failure.name, message: failure.message } : { name: 'Unknown' });
      }
    };
    check();
    return () => { active = false; clearTimeout(timer); setLocalEmulatorsReady(false); };
  }, [retry]);
  if (!localEmulators.enabled) return <>{children}</>;
  return (
    <View style={styles.root}>
      <Text style={styles.banner}>LOCAL FIREBASE · synthetic test data only</Text>
      {ready ? <><LocalGardenChecks />{children}</> : <View style={styles.blocked}><Text>{error}</Text><Button title="Retry local environment" onPress={() => setRetry(value => value + 1)} /></View>}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 }, banner: { backgroundColor: '#7C2D12', color: 'white', textAlign: 'center', paddingTop: 26, paddingBottom: 6, fontSize: 12 },
  blocked: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
});
