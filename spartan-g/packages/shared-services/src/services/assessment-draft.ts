import { doc, runTransaction, serverTimestamp, Timestamp, getDocFromServer, type Firestore } from 'firebase/firestore';

export class DraftConflict extends Error {
  readonly code = 'draft-conflict';
  constructor() { super('This draft changed in another session. Your answers remain here. Reopen the saved draft before continuing.'); }
}
export function draftRevision(value: unknown): number {
  if (value === undefined) return 0; // Existing drafts need no migration.
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new DraftConflict();
  return Number(value);
}
type Answer = {questionId:string;value:string};
export function sameDraft(saved: unknown, answers: readonly Answer[]): boolean {
  if (!Array.isArray(saved) || saved.length !== answers.length) return false;
  const values = new Map(saved.map(a => [a.questionId, a.value]));
  return values.size === answers.length && answers.every(a => values.get(a.questionId) === a.value);
}
/** Whole snapshots require the revision that the editor actually loaded. */
export async function saveDraftSnapshot(db: Firestore, attemptId: string, uid: string,
  answers: readonly Answer[], expectedRevision: number, current:()=>boolean): Promise<number> {
  try {return await runTransaction(db, async tx => {
    const ref=doc(db,'assessment_attempts',attemptId), snap=await tx.get(ref), saved=snap.data();
    if (!current()) throw new DraftConflict();
    if (!saved || saved.studentId !== uid) throw Object.assign(new Error('Assessment access denied.'),{code:'permission-denied'});
    const revision=draftRevision(saved.draftRevision);
    if (['submitted','graded'].includes(saved.status)) {
      if (!sameDraft(saved.answers,answers)) throw new DraftConflict();
      return revision; // Same-ID reconciliation never rewrites clinical evidence.
    }
    if (saved.status !== 'in_progress' || revision !== expectedRevision) throw new DraftConflict();
    const old=Array.isArray(saved.answers)?saved.answers:[];
    tx.update(ref,{answers:answers.map(a=>({questionId:a.questionId,value:a.value,
      answeredAt:old.find(v=>v.questionId===a.questionId&&v.value===a.value)?.answeredAt??Timestamp.now()})),
      draftRevision:revision+1,updatedAt:serverTimestamp()});
    return revision+1;
  },{maxAttempts:5});}catch(error){
    if((error as {code?:string}).code==='permission-denied'&&current()){
      const fresh=(await getDocFromServer(doc(db,'assessment_attempts',attemptId))).data();
      if(fresh?.studentId===uid&&fresh.status==='in_progress'&&draftRevision(fresh.draftRevision)!==expectedRevision)throw new DraftConflict();
    }
    throw error;
  }
}
