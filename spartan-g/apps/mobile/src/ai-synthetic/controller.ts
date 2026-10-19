import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getDocFromServer } from 'firebase/firestore';
import { getFirestoreDb, doc } from '../../../../packages/shared-services/src/firebase/firestore';
import { getFirebaseApp } from '../../../../packages/shared-services/src/firebase/app';
import { getFirebaseAuth, signInWithEmailAndPassword, signOut } from '../../../../packages/shared-services/src/firebase/auth';
import { getNativeAppCheck } from '../../../../packages/shared-services/src/firebase/app-check.native';
import { createAiLogicClient, type Ports } from '../../../../packages/shared-services/src/services/firebase-ai-logic.client';
import { createAiLogicFacade } from '../../../../packages/shared-services/src/services/firebase-ai-facade';
import { createNativeAiPorts } from '../../../../packages/shared-services/src/services/firebase-ai-ports.native';
import { calculatePHQ9Score, calculateGAD7Score, calculateDASS21Score } from '@spartan-g/shared-types';
import { ACCOUNTS, ATTEMPT_ID, BASIC_INPUT, RUN_ID, STAFF_UID, STUDENT_UID, TEST_CONFIG, TOOL_INPUT } from './contract';
import { createRequestBudget, localDay, type Step } from './request-budget';

const budget = createRequestBudget(AsyncStorage, RUN_ID);
let busy = false;
function approvedBuild() {
  if (__DEV__ || Platform.OS !== 'android' || process.env.EXPO_PUBLIC_SPARTAN_AI_SYNTHETIC_TEST !== 'sg_ai_synth_20261019_01') throw Error('Test configuration unavailable.');
  const app = getFirebaseApp();
  if (app.name !== '[DEFAULT]' || app.options.projectId !== TEST_CONFIG.projectId || app.options.appId !== TEST_CONFIG.androidAppId) throw Error('Test configuration unavailable.');
}
async function exclusive<T>(work: () => Promise<T>) {
  if (busy) throw Error('A test action is already running.'); busy = true;
  try { approvedBuild(); return await work(); } finally { busy = false; }
}
export const testStatus = () => budget.snapshot();
export const initializeTest = () => exclusive(() => budget.initialize());
export async function loginTest(email: string, password: string) {
  return exclusive(async () => {
    const account = ACCOUNTS.find(a => a.email === email.trim().toLowerCase());
    if (!account || !password || password.length > 1024) throw Error('Only approved synthetic credentials are accepted.');
    const auth = getFirebaseAuth(); await auth.authStateReady();
    if (auth.currentUser && !TEST_CONFIG.syntheticAccountUids.includes(auth.currentUser.uid)) throw Error('Unexpected saved session. Test stopped; no session was cleared.');
    const result = await signInWithEmailAndPassword(auth, account.email, password);
    if (result.user.uid !== account.uid) throw Error('Synthetic account identity mismatch.');
    return account.role;
  });
}
export const logoutTest = () => exclusive(async () => {
  const auth = getFirebaseAuth(); await auth.authStateReady();
  if (auth.currentUser && !TEST_CONFIG.syntheticAccountUids.includes(auth.currentUser.uid)) throw Error('Unexpected saved session. No session was cleared.');
  await signOut(auth); // Budget storage is deliberately retained across logout.
});

export async function runTest(step: Step): Promise<{ text: string; used: number; attested: boolean; toolCalls: number; cache: string }> {
  return exclusive(async () => {
    const auth = getFirebaseAuth(); await auth.authStateReady();
    const expected = step === 'summary' ? STAFF_UID : STUDENT_UID;
    if (auth.currentUser?.uid !== expected) throw Error('Sign in with the correct synthetic account first.');
    await budget.start(step);
    let fatal = false, attested = false, toolCalls = 0, cache = 'not tested';
    function allowed() {
      approvedBuild();
      if (fatal || auth.currentUser?.uid !== expected) throw Error('Test scope or session changed.');
    }
    function deny(): never { fatal = true; throw Error('Unapproved test data access blocked.'); }
    try {
      const check = getNativeAppCheck(auth.app, { provider: 'play-integrity', projectId: TEST_CONFIG.projectId, androidAppId: TEST_CONFIG.androidAppId });
      const native = createNativeAiPorts(auth, check, TEST_CONFIG, allowed);
      const ports: Ports = { ...native,
        async attested() { const ok = await native.attested(); attested ||= ok; return ok; },
        async actor() {
          const actor = await native.actor();
          if (!actor || actor.uid !== expected || actor.role !== (step === 'summary' ? 'facilitator' : 'student')) return deny();
          return actor;
        },
        async reserveTurn(uid, date, limit) {
          const ledger = await budget.snapshot();
          if (uid !== STUDENT_UID || !ledger || date !== ledger.localDay || date !== localDay() || step === 'summary') return deny();
          const current = await getDocFromServer(doc(getFirestoreDb(), 'assistant_usage', STUDENT_UID));
          allowed();
          if (step === 'basic' ? current.exists() : !current.exists()
            || current.data()?.studentId !== STUDENT_UID || current.data()?.date !== date || current.data()?.count !== 1) return deny();
          // Only two single-use chat actions can invoke this unchanged counter path.
          return native.reserveTurn(uid, date, limit);
        },
        async pendingAssessments(uid) {
          if (step !== 'tool' || uid !== STUDENT_UID || toolCalls !== 0) return deny();
          const attempts = await native.pendingAssessments(uid);
          if (attempts.length !== 0) return deny();
          toolCalls++; return attempts;
        },
        appointments() { return deny(); }, conversations() { return deny(); }, garden() { return deny(); },
        cache: {
          async read(id) {
            if (step !== 'summary' || id !== ATTEMPT_ID) return deny();
            const found = await native.cache.read(id);
            if (found !== null) return deny(); cache = 'missing as expected'; return null;
          },
          async write(id, text) {
            if (step !== 'summary' || id !== ATTEMPT_ID) return deny();
            try { await native.cache.write(id, text); cache = 'UNEXPECTED WRITE SUCCESS'; return deny(); }
            catch (error) {
              if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') { cache = 'write denied as expected'; return; }
              return deny();
            }
          },
        },
      };
      const api = createAiLogicClient(auth.app, { projectId: TEST_CONFIG.projectId, androidAppId: TEST_CONFIG.androidAppId,
        aiLogicConfigured: true, appCheckConfigured: true }, ports, { beforeRequest: async kind => { allowed(); await budget.reserve(kind); } });
      const facade = createAiLogicFacade(() => api);
      let text: string;
      if (step === 'summary') {
        // Denial consumes no provider request and cannot read an unallowlisted attempt.
        if (await api.generateSummary(RUN_ID + '_unallowlisted').then(() => true, () => false)) return deny();
        if (await facade.geminiService.getCachedSummary(ATTEMPT_ID) !== null) return deny();
        const answers = Object.fromEntries([['phq', 9], ['gad', 7], ['dass', 21]].flatMap(([p, n]) =>
          Array.from({ length: Number(n) }, (_, i) => [String(p) + (i + 1), '0'])));
        const phq = calculatePHQ9Score(answers), gad = calculateGAD7Score(answers), dass = calculateDASS21Score(answers);
        const summary = await facade.geminiService.generateSummary({ phqScore: phq.score, phqSeverity: phq.severity,
          gadScore: gad.score, gadSeverity: gad.severity, dassDepressionScore: dass.depression.score, dassDepressionSeverity: dass.depression.severity,
          dassAnxietyScore: dass.anxiety.score, dassAnxietySeverity: dass.anxiety.severity, dassStressScore: dass.stress.score, dassStressSeverity: dass.stress.severity,
          overallRiskLevel: 'unknown', overallRiskScore: 0 }, ATTEMPT_ID);
        if (!summary || fatal) throw Error('Summary unavailable.');
        await facade.geminiService.cacheSummary(ATTEMPT_ID, summary);
        if (fatal || cache !== 'write denied as expected') throw Error('Cache boundary check failed.');
        text = summary;
      } else {
        const denied = await facade.assistantGeminiClient.chatWithAssistant('Synthetic ownership check', RUN_ID + '_unallowlisted');
        if (denied.status !== 'error') return deny();
        const reply = await facade.assistantGeminiClient.chatWithAssistant(step === 'basic' ? BASIC_INPUT : TOOL_INPUT, STUDENT_UID);
        if (reply.status !== 'ok' || fatal || (step === 'tool' && toolCalls !== 1)) throw Error('Sparty unavailable or required tool was not used.');
        text = reply.text;
      }
      const finished = await budget.finish(true);
      if (finished.stopped) throw Error('Unexpected provider request count; testing stopped.');
      return { text, used: finished.used, attested, toolCalls, cache };
    } catch {
      try { await budget.finish(false); } catch { /* Interrupted/corrupt journal remains locked. Never reset. */ }
      throw Error('Test stopped. No automatic retry or budget reset. Report the displayed request count.');
    }
  });
}
