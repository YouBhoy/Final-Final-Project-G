import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, type Firestore } from 'firebase/firestore';
import type { StatisticsSource } from './statisticsData';

/** Client SDK reads always pass through the deployed Firestore security rules. */
export function createFirestoreStatisticsSource(db: Firestore, currentUid: () => string | null): StatisticsSource {
  return {
    currentUid,
    user: async uid => (await getDocFromServer(doc(db, 'users', uid))).data(),
    records: async (name, maximum) => {
      const snapshot = await getDocsFromServer(query(collection(db, name), limit(maximum)));
      return snapshot.docs.map(record => ({ ...record.data(), id: record.id }));
    },
  };
}
