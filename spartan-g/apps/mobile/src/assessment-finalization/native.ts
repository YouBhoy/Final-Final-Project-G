import { AppState } from 'react-native';
import { doc, getDocFromServer } from 'firebase/firestore';
import { useAuthStore } from '@spartan-g/shared-services';
import { getFirebaseAuth } from '@spartan-g/shared-services/src/firebase/auth';
import { getFirestoreDb } from '@spartan-g/shared-services/src/firebase/firestore';
import { appLock, currentLockActor } from '../security/app-lock';
import { createSubmissionCoordinator, SubmissionFailure, type Progress } from './core';
import { configuredEndpoint, sendSubmission } from './http';
import { saveDraftSnapshot, draftRevision } from '@spartan-g/shared-services/src/services/assessment-draft';
export function createNativeSubmission(focused:()=>boolean,progress:(stage:Progress)=>void) {
  // No default/fake URL, production activation, Admin SDK, or credential persistence.
  const endpoint=configuredEndpoint(process.env.EXPO_PUBLIC_ASSESSMENT_FINALIZER_ENABLED,process.env.EXPO_PUBLIC_ASSESSMENT_FINALIZER_URL,getFirestoreDb().app.options.projectId);
  const context=()=>{const auth=useAuthStore.getState(),a=currentLockActor(),lock=appLock.getSnapshot();return auth.session?{uid:auth.session.uid,session:auth.session,ready:focused()&&AppState.currentState==='active'&&auth.isInitialized&&auth.status==='authenticated'&&auth.session.role==='student'&&!!a&&a.owner===lock.owner&&a.session===lock.session&&lock.phase==='ready'&&!lock.background&&!lock.busy}:null;};
  const revisions=new Map<string,number>();
  const coordinator=createSubmissionCoordinator({actor:context,configured:()=>!!endpoint,progress,
    async token(){const a=context(),user=getFirebaseAuth().currentUser;if(!a?.ready||user?.uid!==a.uid)throw new SubmissionFailure('unauthenticated');try{return await user.getIdToken(true);}catch{throw new SubmissionFailure('unauthenticated');}},
    async save(attemptId,answers){const a=context();if(!a?.ready)throw new SubmissionFailure('stale-session');const revision=await saveDraftSnapshot(getFirestoreDb(),attemptId,a.uid,answers,revisions.get(attemptId)??0,()=>context()?.session===a.session&&context()?.ready===true);revisions.set(attemptId,revision);},
    send:(token,body)=>{if(!endpoint)throw new SubmissionFailure('backend-unavailable');return sendSubmission(endpoint,token,body);},
    async confirm(receipt,answers){const a=context();if(!a?.ready)throw new SubmissionFailure('stale-session');const snap=await getDocFromServer(doc(getFirestoreDb(),'assessment_attempts',receipt.attemptId)),saved=snap.data();if(!saved||saved.studentId!==a.uid||snap.metadata.fromCache||snap.metadata.hasPendingWrites||!['submitted','graded'].includes(saved.status)||!Array.isArray(saved.answers)||saved.answers.length!==37||answers.some(v=>!saved.answers.some((s:{questionId:string;value:string})=>s.questionId===v.questionId&&s.value===v.value)))throw new SubmissionFailure('unconfirmed');if(receipt.followUp==='recorded'){const alert=await getDocFromServer(doc(getFirestoreDb(),'risk_alerts','assessment_'+receipt.attemptId));if(!alert.exists()||alert.data().studentId!==a.uid||alert.data().assessmentAttemptId!==receipt.attemptId)throw new SubmissionFailure('unconfirmed');}},
  });
  return Object.assign(coordinator,{bindDraft(attemptId:string,revision:unknown){revisions.set(attemptId,draftRevision(revision));}});
}
