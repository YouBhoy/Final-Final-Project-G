import type { Firestore } from 'firebase/firestore';

/** Production Rules still support the v31 writer. Only staging has approved outbox Rules. */
export function shouldWriteMessageOutbox(db: Pick<Firestore, 'app'>): boolean {
  const project = db.app.options.projectId;
  if (project === 'spartan-g-a2d80') return false;
  if (project === 'spartan-g-assessment-staging') return true;
  throw new Error('message_outbox_project_not_approved');
}
