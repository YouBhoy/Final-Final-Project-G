import 'expo'; // Retain Expo's existing native URL/runtime initialization for Firebase AI Logic.
import { useEffect, useState } from 'react';
import { AppRegistry, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { initializeTest, loginTest, logoutTest, runTest, testStatus } from './controller';
import type { Ledger, Step } from './request-budget';

function SyntheticAiTest() {
  const [fonts] = useFonts({ ...Feather.font, ...Ionicons.font, ...MaterialCommunityIcons.font });
  const [ledger, setLedger] = useState<Ledger | null>(null), [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [status, setStatus] = useState('Private synthetic test. No AI request has been made by this screen.'), [output, setOutput] = useState('');
  useEffect(() => { testStatus().then(setLedger).catch(() => setStatus('Budget storage unavailable. Testing is blocked; do not reset app data.')); }, []);
  async function action(work: () => Promise<unknown>) {
    if (busy) return; setBusy(true); setOutput('');
    try { await work(); } catch { setStatus('Test action unavailable or stopped. No automatic retry. Keep app data and report this status/count.'); }
    finally { try { setLedger(await testStatus()); } catch { setStatus('Budget journal unavailable; testing blocked. Do not reset app data.'); } setPassword(''); setBusy(false); }
  }
  async function step(name: Step) {
    await action(async () => { const r = await runTest(name); setOutput(r.text);
      setStatus(`${name}: response received. Provider attempts ${r.used}/4. App Check verified: ${r.attested ? 'yes' : 'no'}. Tool calls: ${r.toolCalls}. Cache: ${r.cache}.`); });
  }
  const locked = busy || !!ledger?.stopped || !!ledger?.active;
  const button = (label: string, work: () => Promise<unknown>, disabled = false) => <Pressable disabled={busy || disabled} onPress={() => action(work)} style={[styles.button, (busy || disabled) && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.titleRow}><Image source={require('../../assets/floating-assistant-icon.png')} style={styles.image} /><Text style={styles.title}>Spartan-G private AI test</Text></View>
    {fonts && <View style={styles.titleRow}><Feather name="shield" size={22} /><Ionicons name="lock-closed" size={22} /><MaterialCommunityIcons name="robot" size={22} /><Text>Packaged icons and artwork</Text></View>}
    <Text>Fictional test accounts only. Four provider attempts TOTAL, including errors. No general student AI. No dashboard or staff-list subscriptions are mounted.</Text>
    <Text style={styles.counter}>Persisted provider attempts: {ledger ? ledger.used : 'not initialized'}/4</Text>
    <Text selectable accessibilityLiveRegion="polite">{status}</Text>
    {button('Initialize budget ONCE when ready to test', async () => { setLedger(await initializeTest()); setStatus('Budget initialized. Sign in with the synthetic student credentials from your secure local helper.'); }, !!ledger)}
    <TextInput value={email} onChangeText={setEmail} placeholder="Approved synthetic email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={styles.input} editable={!busy} />
    <TextInput value={password} onChangeText={setPassword} placeholder="Synthetic password" secureTextEntry autoCapitalize="none" autoCorrect={false} style={styles.input} editable={!busy} />
    {button('Sign in synthetic account', async () => { const role = await loginTest(email, password); setStatus(`Synthetic ${role} signed in. No provider request made by sign-in.`); }, !ledger || locked)}
    {button('Sign out synthetic account', async () => { await logoutTest(); setStatus('Synthetic account signed out. Request budget retained.'); }, !ledger)}
    {(['basic', 'tool', 'summary'] as Step[]).map((name, i) => <Pressable key={name} disabled={!ledger || locked || ledger.actions[name].status !== 'ready' || (i > 0 && ledger.actions[(['basic', 'tool', 'summary'] as Step[])[i - 1]].status !== 'passed')} onPress={() => step(name)} style={[styles.button, (!ledger || locked || ledger.actions[name].status !== 'ready') && styles.disabled]}><Text style={styles.buttonText}>{i + 1}. {name === 'summary' ? 'Facilitator summary (staff sign-in)' : 'Sparty ' + name}</Text></Pressable>)}
    {ledger && <Text selectable>{JSON.stringify(ledger.actions)}</Text>}
    {!!output && <View style={styles.output}><Text selectable>{output}</Text></View>}
    <Text>Do not clear data, reinstall on another device, reset the budget or repeat completed steps. A failed/interrupted action locks testing. Share status/counts only; never passwords or tokens.</Text>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#F8FAFC' }, content: { padding: 22, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, image: { width: 54, height: 54 }, title: { fontSize: 22, fontWeight: '700', flex: 1 },
  counter: { fontSize: 18, fontWeight: '700' }, button: { backgroundColor: '#B91C1C', padding: 14, borderRadius: 9 }, buttonText: { color: 'white', fontWeight: '600' },
  disabled: { opacity: 0.4 }, input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#CBD5E1', padding: 12, borderRadius: 8 }, output: { backgroundColor: 'white', padding: 16, borderRadius: 8 },
});
AppRegistry.registerComponent('main', () => SyntheticAiTest);
