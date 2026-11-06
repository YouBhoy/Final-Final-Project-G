import { SubmissionFailure, type Answer, type Receipt } from '../src/assessment-finalization/core';
// Staging packaging cannot activate finalization by changing an environment flag.
export function configuredEndpoint(_enabled:unknown,_url:unknown,_projectId?:unknown):string|null{return null;}
export async function sendSubmission(_endpoint:string,_token:string,_body:{attemptId:string;answers:readonly Answer[]}):Promise<Receipt>{throw new SubmissionFailure('backend-unavailable');}
