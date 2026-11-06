import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDocFromServer } from 'firebase/firestore';
import { getFirebaseAuth } from '@spartan-g/shared-services/src/firebase/auth';
import { getFirestoreDb } from '@spartan-g/shared-services/src/firebase/firestore';
import { useAuthStore } from '@spartan-g/shared-services';
import { DEFAULT_PRIVACY_POLICY } from './policy-default';
import { createPolicyConsent, parsePortalPolicy, type PolicyActor, type PortalPolicy } from './policy-consent';
const sessions = new WeakMap<object, string>();
let sessionSequence = 0;

export function currentPolicyActor(): PolicyActor | null {
  try {
    const state = useAuthStore.getState(), auth = getFirebaseAuth(), user = auth.currentUser;
    const project = auth.app.options.projectId, signIn = user?.metadata.lastSignInTime;
    if (state.status !== 'authenticated' || !state.session || !['student', 'facilitator'].includes(state.session.role) || user?.uid !== state.session.uid || user.isAnonymous || !signIn || !Number.isFinite(Date.parse(signIn)) || !['spartan-g-a2d80', 'spartan-g-assessment-staging'].includes(project ?? '')) return null;
    // Same per-sign-in scope as main's privacySession.ts, isolated by Firebase project.
    // A fresh mobile sign-in/process cannot inherit a previous session's local acknowledgement,
    // including two sign-ins whose Firebase metadata has the same second precision.
    let deviceSession = sessions.get(state.session);
    if (!deviceSession) { deviceSession = `${Date.now()}:${++sessionSequence}`; sessions.set(state.session, deviceSession); }
    return { owner: JSON.stringify([project, state.session.uid, signIn, deviceSession]), session: state.session };
  } catch { return null; }
}
export async function loadPortalPolicy(): Promise<PortalPolicy> {
  const actor = currentPolicyActor(); if (!actor) throw new Error('Sign-in required');
  const db = getFirestoreDb();
  if (db.app.options.projectId !== getFirebaseAuth().app.options.projectId) throw new Error('Policy project mismatch');
  const snapshot = await getDocFromServer(doc(db, 'platform_settings', 'privacy_policy'));
  const current = currentPolicyActor();
  if (current?.owner !== actor.owner || current.session !== actor.session) throw new Error('Session changed');
  return snapshot.exists() ? parsePortalPolicy(snapshot.data()) : { ...DEFAULT_PRIVACY_POLICY };
}
// One receipt per project on this device; no Firestore consent collection, account mutation, token or password.
const receiptKey = () => {
  const actor = currentPolicyActor(); if (!actor) throw new Error('Sign-in required');
  const [project] = JSON.parse(actor.owner) as string[];
  return `spartan-g:privacy-session:${project}`;
};
export function makePortalConsent() {
  return createPolicyConsent({ actor: currentPolicyActor, load: loadPortalPolicy, now: () => new Date(),
    async read() { const raw = await AsyncStorage.getItem(receiptKey()); if (raw === null) return null; return JSON.parse(raw) as unknown; },
    async save(receipt) { if (currentPolicyActor()?.owner !== receipt.owner) throw new Error('Session changed'); await AsyncStorage.setItem(receiptKey(), JSON.stringify(receipt)); },
  });
}
