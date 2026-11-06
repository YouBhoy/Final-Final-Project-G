import { SubmissionFailure, type Receipt, type Answer } from './core';
export function configuredEndpoint(enabled:unknown,url:unknown,projectId?:unknown):string|null {
  if(enabled!=='true'||typeof url!=='string'||!url)return null;
  try{const u=new URL(url);if(!(u.protocol==='https:'&&/^[a-z0-9-]+\.netlify\.app$/.test(u.hostname)&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/api/assessment-submit'))return null;
    if(projectId!==undefined){const staging=u.hostname==='spartang-assessment-staging.netlify.app';if(projectId==='spartan-g-assessment-staging'?!staging:projectId!=='spartan-g-a2d80'||staging)return null;}
    return u.href;
  }catch{return null;}
}
export async function sendSubmission(endpoint:string,token:string,body:{attemptId:string;answers:readonly Answer[]},transport:typeof fetch=fetch):Promise<Receipt> {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
  try {
    const response=await transport(endpoint,{method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:controller.signal});
    if(response.redirected||(response.url&&response.url!==endpoint))throw new SubmissionFailure('unconfirmed');
    const text=await response.text();if(text.length>4096)throw new SubmissionFailure('unconfirmed');let data:Record<string,unknown>;try{data=JSON.parse(text);}catch{throw new SubmissionFailure('unconfirmed');}
    if(!response.ok){const code=data.error==='failed-precondition'&&data.reason==='draft-conflict'?'draft-conflict':typeof data.error==='string'&&['unauthenticated','permission-denied','failed-precondition','rate-limited'].includes(data.error)?data.error:'unconfirmed';throw new SubmissionFailure(code);}
    if(data.version!==1||data.attemptId!==body.attemptId||!['submitted','graded'].includes(String(data.status))||typeof data.alreadySubmitted!=='boolean'||!['recorded','not-required'].includes(String(data.followUp))||typeof data.submittedAt!=='string'||!Number.isFinite(Date.parse(data.submittedAt)))throw new SubmissionFailure('unconfirmed');
    return data as unknown as Receipt;
  }catch(error){if(error instanceof SubmissionFailure)throw error;throw new SubmissionFailure('unconfirmed');}finally{clearTimeout(timer);}
}
