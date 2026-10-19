// HOST-SIDE ONLY. Never imported by Android; its fetch cannot enforce redirect refusal.
import { HttpFailure } from './errors';
export interface TerminalStore { read(uid: string, attemptId: string): Promise<boolean>; write(uid: string, attemptId: string): Promise<void> }
export class HostGardenClient {
  private readonly origin: string;
  constructor(private readonly dependencies: { origin:string; local?:boolean; timeoutMs?:number;
    user(): {uid:string; token():Promise<string>} | undefined; terminals:TerminalStore }) {
    const url = new URL(dependencies.origin);
    const loopback = url.hostname === '127.0.0.1';
    if ((url.protocol !== 'https:' && !(dependencies.local === true && loopback && url.protocol === 'http:'))
        || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.origin === 'null') throw Error('Approved HTTPS origin required');
    const timeout = dependencies.timeoutMs ?? 75000;
    if (!Number.isSafeInteger(timeout) || timeout < 10 || timeout > 90000) throw Error('Bounded timeout required');
    this.origin = url.origin;
  }
  async invoke(name: 'waterGarden' | 'recoverAssessmentReward' | 'finalizeAssessment', data: Readonly<Record<string,string>>): Promise<unknown> {
    const user = this.dependencies.user(); if (!user) throw new HttpFailure(401,'unauthenticated','authentication_required');
    const path = name === 'waterGarden' ? '/v1/watering' : name === 'finalizeAssessment' ? '/v1/assessments/finalize' : '/v1/assessments/recover';
    const attemptId = data.attemptId;
    if (attemptId && await this.dependencies.terminals.read(user.uid,attemptId)) throw new HttpFailure(409,'failed-precondition','review_required');
    const token = await user.token();
    if (this.dependencies.user()?.uid !== user.uid) throw new HttpFailure(401,'unauthenticated','session_changed');
    let response: Response;
    try {
      response = await fetch(this.origin+path,{method:'POST',redirect:'error',credentials:'omit',
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(data),
        signal:AbortSignal.timeout(this.dependencies.timeoutMs ?? 75000)});
    } catch { throw new HttpFailure(503,'unavailable','outcome_unknown',true); }
    if (response.url !== this.origin+path || response.redirected) throw new HttpFailure(503,'unavailable','unexpected_destination',true);
    const reader = response.body?.getReader(); let size = 0; const chunks:Uint8Array[]=[];
    if (!reader) throw new HttpFailure(503,'unavailable','invalid_response',true);
    try {
      while (true) { const result=await reader.read(); if(result.done)break; size+=result.value.length;
        if(size>16384){await reader.cancel();throw new HttpFailure(503,'unavailable','invalid_response',true);} chunks.push(result.value); }
    } catch (error) {
      if (error instanceof HttpFailure) throw error;
      throw new HttpFailure(503,'unavailable','outcome_unknown',true);
    } finally { reader.releaseLock(); }
    let parsed:unknown; try {parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;} catch {throw new HttpFailure(503,'unavailable','invalid_response',true);}
    if(!parsed||typeof parsed!=='object'||!('ok'in parsed))throw new HttpFailure(503,'unavailable','invalid_response',true);
    if(this.dependencies.user()?.uid!==user.uid)throw new HttpFailure(401,'unauthenticated','session_changed');
    if(!response.ok || parsed.ok!==true) {
      const raw='error'in parsed && parsed.error && typeof parsed.error==='object' ? parsed.error : {};
      const code='code'in raw&&typeof raw.code==='string'?raw.code:'unavailable';
      const reason='reason'in raw&&typeof raw.reason==='string'&&/^[a-z_]{1,64}$/.test(raw.reason)?raw.reason:'backend_unavailable';
      const retryable='retryable'in raw&&raw.retryable===true;
      if(attemptId&&!retryable&&[400,404,409].includes(response.status))await this.dependencies.terminals.write(user.uid,attemptId);
      const error=new HttpFailure(response.status,code,reason,retryable);
      throw Object.assign(error,{details:{reason,retryable}});
    }
    return 'data'in parsed?parsed.data:undefined;
  }
}
