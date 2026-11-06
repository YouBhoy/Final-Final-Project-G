import { collection, getDocs, getFirestoreDb, limit, query, where } from '@spartan-g/shared-services/src/firebase/firestore';
import { parseStudentResource, type StudentResource } from './resources-model';

/** Bounded READ only. Existing server rules remain authoritative. No admin/upload API. */
export async function readStudentResources(authorized: () => boolean): Promise<StudentResource[]> {
  if (!authorized()) throw new Error('resources/not-authorized');
  const snapshot = await getDocs(query(collection(getFirestoreDb(), 'resources'), where('isActive', '==', true), where('audience', 'in', ['all', 'students']), limit(100)));
  if (!authorized()) throw new Error('resources/not-authorized');
  return snapshot.docs.map(row => parseStudentResource(row.id, row.data())).filter((row): row is StudentResource => row !== null).sort((a, b) => a.title.localeCompare(b.title));
}
