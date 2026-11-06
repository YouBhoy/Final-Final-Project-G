export type Answer=Readonly<{questionId:string;value:string}>;
export type Actor=Readonly<{uid:string;session:unknown;ready:boolean}>;
export type Progress='saving-draft'|'verifying-session'|'submitting'|'confirming';
export interface Receipt {version:1;attemptId:string;status:'submitted'|'graded';alreadySubmitted:boolean;followUp:'recorded'|'not-required';submittedAt:string}
export class SubmissionFailure extends Error {
  constructor(readonly code:string) { super(submissionMessage(code)); }
}
export function submissionMessage(code:string) {
  if(code==='draft-conflict')return 'This draft changed in another session. Your answers remain here. Reopen the saved draft before continuing.';
  if(code==='backend-unavailable')return 'Secure submission is not available yet. Your answers remain in this assessment. Try again once the submission service is activated.';
  if(code==='invalid-answers')return 'Please answer all 37 questions using the available choices before submitting.';
  if(code==='unauthenticated')return 'Firebase could not verify your session. Your answers are retained. Sign in again when your connection is available.';
  if(code==='permission-denied')return 'This account is not authorized to finalize the assessment. Your answers are retained. Contact your facilitator.';
  if(code==='rate-limited')return 'Too many submission attempts. Your answers are retained. Wait a minute before retrying.';
  if(code==='stale-session')return 'Your session is no longer unlocked. Resume from your saved assessment after signing in and unlocking.';
  if(code==='failed-precondition')return 'Submission could not be completed under the current assessment or follow-up settings. Your answers are retained. Contact your facilitator.';
  return 'Submission has not been confirmed. Keep this assessment open, check your connection and retry. A retry checks the same submission.';
}
export const questionIds=Object.freeze([...Array.from({length:9},(_,i)=>`phq${i+1}`),...Array.from({length:7},(_,i)=>`gad${i+1}`),...Array.from({length:21},(_,i)=>`dass${i+1}`)]);
export function canonicalAnswers(map:Record<string,string>):Answer[] {
  if(Object.keys(map).length!==37||questionIds.some(id=>!Object.hasOwn(map,id)||typeof map[id]!=='string'||!/^[0-3]$/.test(map[id])))throw new SubmissionFailure('invalid-answers');
  return questionIds.map(questionId=>({questionId,value:map[questionId]}));
}
export interface SubmissionPorts {
  actor():Actor|null; configured():boolean; token():Promise<string>;
  save(attemptId:string,answers:readonly Answer[]):Promise<void>;
  send(token:string,body:{attemptId:string;answers:readonly Answer[]}):Promise<Receipt>;
  confirm(receipt:Receipt,answers:readonly Answer[]):Promise<void>;
  progress?(stage:Progress):void;
}
export function createSubmissionCoordinator(ports:SubmissionPorts) {
  let generation=0,stopped=false,flight:Promise<void>|null=null,queue=Promise.resolve(),retained:readonly Answer[]|null=null,binding:Actor|null=null;
  const actor=()=>{const a=ports.actor();if(stopped||!a?.ready)throw new SubmissionFailure('stale-session');return a;};
  const matches=(a:Actor,g:number)=>{const now=ports.actor();if(stopped||generation!==g||!now?.ready||now.uid!==a.uid||now.session!==a.session){retained=null;throw new SubmissionFailure('stale-session');}};
  const coordinator={
    synchronize(){const current=ports.actor();if(!current?.ready||(binding&&(binding.uid!==current.uid||binding.session!==current.session))){generation++;retained=null;binding=null;}},
    stop(){stopped=true;generation++;retained=null;},
    queueDraft(attemptId:string,map:Record<string,string>) {
      if(flight||stopped)return Promise.resolve();const a=actor(),g=generation,snapshot=Object.entries(map).map(([questionId,value])=>({questionId,value}));
      const task=queue.then(async()=>{matches(a,g);await ports.save(attemptId,snapshot);matches(a,g);});queue=task.catch(()=>{});return task;
    },
    submit(attemptId:string,map:Record<string,string>):Promise<void> {
      const a=actor();if(flight){if(!binding||binding.uid!==a.uid||binding.session!==a.session)throw new SubmissionFailure('stale-session');return flight;}const g=generation,snapshot=canonicalAnswers(map);binding=a;retained=snapshot;
      flight=Promise.resolve().then(async()=>{try{
        await queue;matches(a,g);ports.progress?.('saving-draft');await ports.save(attemptId,snapshot);matches(a,g);
        if(!ports.configured())throw new SubmissionFailure('backend-unavailable');
        ports.progress?.('verifying-session');const token=await ports.token();matches(a,g);
        ports.progress?.('submitting');const receipt=await ports.send(token,{attemptId,answers:snapshot});matches(a,g);
        if(receipt.attemptId!==attemptId)throw new SubmissionFailure('unconfirmed');
        ports.progress?.('confirming');await ports.confirm(receipt,snapshot);matches(a,g);retained=null;
      }catch(error){matches(a,g);const code=(error as {code?:unknown})?.code;throw error instanceof SubmissionFailure?error:new SubmissionFailure(code==='permission-denied'||code==='unauthenticated'||code==='draft-conflict'?code:'unconfirmed');}}).finally(()=>{flight=null;});return flight;
    },
    retained(){const current=actor();if(!binding||binding.uid!==current.uid||binding.session!==current.session){retained=null;return null;}return retained?.map(a=>({...a}))??null;},
  };return coordinator;
}
