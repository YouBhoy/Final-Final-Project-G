import { collection, getDocs, query, where } from 'firebase/firestore';
import type { AssessmentDefinitionDocument } from '@spartan-g/shared-types';
import { db } from '../firebase/firebase';

export type PublishedAssessment = Pick<AssessmentDefinitionDocument,
  'courseId' | 'title' | 'description' | 'maxAttempts' | 'isPublished'> & { id: string; questionCount: number };

export async function getPublishedAssessmentDefinitions(): Promise<PublishedAssessment[]> {
  // Only display metadata lives here; student records and answer keys stay out of the catalog.
  const snapshot = await getDocs(query(collection(db, 'assessment_catalog'), where('isPublished', '==', true)));
  return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PublishedAssessment))
    .sort((a, b) => a.title.localeCompare(b.title));
}
