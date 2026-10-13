import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';

export const DEFAULT_PRIVACY_POLICY = {
  title: 'Privacy Policy',
  body: 'PURPOSE OF SPARTAN-G\nSPARTAN-G supports student wellbeing and institutional guidance services through check-in assessments, appointment scheduling, messages, referrals, and educational resources. Our goal is to support awareness and conversations with guidance staff, not to diagnose students.\n\nNOT A MEDICAL OR DIAGNOSTIC TOOL\nSPARTAN-G is not a medical or diagnostic tool. Assessment scores, severity labels, risk indicators, and any AI-generated summaries are screening and guidance information, not medical diagnoses. They do not establish that you have a mental health condition and do not replace assessment, advice, or treatment from a qualified healthcare professional.\n\nINFORMATION USED BY THE SYSTEM\nThe system uses account and campus information, assessment responses and results, appointment details, and messages to provide its guidance features. Reports may summarize assessment activity and wellbeing indicators for authorized administrators.\n\nACCESS TO YOUR INFORMATION\nStudents can access their own records. Facilitators can access student guidance records according to their assigned relationships and permissions. Super administrators manage accounts, platform settings, and reporting with broader administrative access. Do not assume that messages or assessment information are visible only to you.\n\nYOUR CHOICE\nPlease review this policy before entering the portal. Check the agreement box and select I Agree to continue, or Deny to sign out. You will be asked again at your next login. Denying after signup signs you out without deleting your account. If you have questions about your information or the system, contact your institution\'s guidance office.',
};
export interface PrivacyPolicy { title: string; body: string; version: number }
const policyRef = () => doc(db, 'platform_settings', 'privacy_policy');

export async function loadPrivacyPolicy(): Promise<PrivacyPolicy> {
  const snapshot = await getDocFromServer(policyRef());
  if (!snapshot.exists()) return { ...DEFAULT_PRIVACY_POLICY, version: 0 };
  const data = snapshot.data();
  if (typeof data.title !== 'string' || !data.title.trim() || typeof data.body !== 'string'
    || !data.body.trim() || !Number.isInteger(data.version) || data.version < 1) {
    throw new Error('The privacy policy is unavailable. Please contact an administrator.');
  }
  return { title: data.title, body: data.body, version: data.version };
}

export async function savePrivacyPolicy(title: string, body: string, expectedVersion: number) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Please sign in again.');
  title = title.trim(); body = body.trim();
  if (!title || title.length > 120 || !body || body.length > 20000) {
    throw new Error('Enter a title (up to 120 characters) and policy body (up to 20,000 characters).');
  }
  return runTransaction(db, async tx => {
    const ref = policyRef(), previous = await tx.get(ref);
    const version = previous.exists() ? previous.data().version : 0;
    if (version !== expectedVersion) throw new Error('Another administrator changed the policy. Reload it before saving your changes.');
    tx.set(ref, { title, body, version: version + 1, updatedBy: uid, updatedAt: serverTimestamp() });
    return { title, body, version: version + 1 };
  });
}
