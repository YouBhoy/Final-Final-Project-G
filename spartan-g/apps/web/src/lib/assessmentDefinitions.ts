import { getFunctions, httpsCallable } from 'firebase/functions';
import type { AssessmentDefinitionDocument } from '@spartan-g/shared-types';
import { app } from '../firebase/firebase';

export async function getPublishedAssessmentDefinitions() {
  const callable = httpsCallable<void, { assessments: (AssessmentDefinitionDocument & { id: string })[] }>(
    getFunctions(app), 'getPublishedAssessmentDefinitions',
  );
  const result = await callable();
  return result.data.assessments.sort((a, b) => a.title.localeCompare(b.title));
}
