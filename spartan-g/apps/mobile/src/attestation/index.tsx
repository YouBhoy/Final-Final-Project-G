import { useRef, useState } from 'react';
import { AppRegistry, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { performAttestation, type AttestationResult } from './attestation-controller';

function AttestationOnly() {
  const attempted = useRef(false);
  const [state, setState] = useState<AttestationResult | 'ready' | 'running'>('ready');
  async function run() {
    if (attempted.current) return;
    attempted.current = true;
    setState('running');
    setState(await performAttestation());
  }
  const messages = {
    ready: 'Ready. No attestation request has been made.',
    running: 'Checking genuine Play Integrity attestation…',
    verified: 'Verified: a valid Play Integrity App Check token was obtained.',
    configuration_unavailable: 'Test configuration is unavailable. No attestation request was made.',
    attestation_unavailable: 'Attestation was unavailable or timed out. No bypass was used.',
  };
  return <SafeAreaView style={styles.root}><View style={styles.card}>
    <Text style={styles.title}>SPARTAN-G App Check test</Text>
    <Text style={styles.text}>Dedicated release signature. Attestation only.</Text>
    <Text style={styles.text}>AI, sign-in and student data workflows are excluded from this test build.</Text>
    <Text style={styles.status} accessibilityLiveRegion="polite">{messages[state]}</Text>
    <Pressable disabled={state !== 'ready'} onPress={run} style={[styles.button, state !== 'ready' && styles.disabled]}>
      <Text style={styles.buttonText}>Verify App Check once</Text>
    </Pressable>
    <Text style={styles.text}>No raw tokens are displayed or saved as test evidence. The Firebase SDK owns its standard token cache.</Text>
    <Text style={styles.small}>Attestation test only · not a student release</Text>
  </View></SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  text: { color: '#334155', fontSize: 16 }, status: { color: '#0F172A', fontSize: 18, fontWeight: '600' },
  button: { backgroundColor: '#B91C1C', padding: 16, borderRadius: 8 }, disabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  small: { color: '#475569', fontSize: 13 },
});
AppRegistry.registerComponent('main', () => AttestationOnly);
