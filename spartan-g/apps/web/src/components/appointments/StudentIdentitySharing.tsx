import { useEffect, useState } from 'react';
import { deleteDoc, doc, getDocFromServer, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../hooks/useAuth';

export function StudentIdentitySharing({ facilitatorId }: { facilitatorId: string }) {
  const { user } = useAuth();
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setBusy(true); setShared(false); setError('');
    if (!user) return;
    getDocFromServer(doc(db, 'student_identity_consents', `${facilitatorId}_${user.uid}`))
      .then(snapshot => { if (!cancelled) setShared(snapshot.exists()); })
      .catch(() => { if (!cancelled) setError('Unable to check identity sharing. Reopen this appointment to retry.'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [facilitatorId, user?.uid]);
  async function changeSharing() {
    if (!user || user.role !== 'student') return;
    setBusy(true); setError('');
    try {
      const ref = doc(db, 'student_identity_consents', `${facilitatorId}_${user.uid}`);
      if (shared) await deleteDoc(ref);
      else await setDoc(ref, { studentId: user.uid, facilitatorId, requestedAt: serverTimestamp() });
      setShared(!shared);
    } catch { setError('Unable to update identity sharing. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="rounded-lg border border-[var(--color-border)] p-3 text-sm">
    <p className="font-semibold">Your identity</p>
    <p className="mt-1 text-[var(--color-text-secondary)]">{shared
      ? 'You have requested support and shared your name and email with this facilitator. Identity access also requires an accepted connection.'
      : 'Your name and email stay hidden from this facilitator until you request support and share them.'}</p>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    <button type="button" disabled={busy} onClick={changeSharing} className="mt-2 font-medium text-[var(--color-primary)] underline disabled:opacity-50">
      {busy ? 'Checking...' : shared ? 'Stop sharing my identity' : 'Request support and share my identity'}
    </button>
  </div>;
}
