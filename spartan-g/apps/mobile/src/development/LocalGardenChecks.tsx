import { useEffect } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { useAuthStore } from '@spartan-g/shared-services/src/store/auth.store';
import { getFirestoreDb } from '@spartan-g/shared-services/src/firebase/firestore';
import { localEmulators } from '@spartan-g/shared-services/src/config/local-emulators';

/** Read-only probes for known synthetic fixtures, mounted only in explicit local mode. */
export function LocalGardenChecks() {
  const uid = useAuthStore(state => state.session?.uid);
  useEffect(() => {
    if (!localEmulators.enabled || !uid || !['local-garden-existing', 'local-garden-missing',
      'local-garden-other', 'local-garden-init-test'].includes(uid)) return;
    const check = async () => {
      const db = getFirestoreDb();
      const own = await getDocFromServer(doc(db, 'student_gardens', uid));
      const data = own.data();
      console.info('[LocalFirebase] Android own Garden read', {
        uid, exists: own.exists(), level: data?.level, xp: data?.xp, seeds: data?.seeds,
      });
      const other = uid === 'local-garden-other' ? 'local-garden-existing' : 'local-garden-other';
      try {
        await getDocFromServer(doc(db, 'student_gardens', other));
        console.error('[LocalFirebase] FAIL: Android cross-user Garden was readable.');
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code === 'permission-denied') console.info('[LocalFirebase] PASS: Android cross-user Garden permission-denied.');
        else console.error('[LocalFirebase] Android ownership probe failed', { code });
      }
    };
    check().catch(() => console.error('[LocalFirebase] Android read-only probe unavailable.'));
  }, [uid]);
  return null;
}
