import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { AppState } from 'react-native';
import { useAuthStore } from '@spartan-g/shared-services';
import type { AuthSession } from '@spartan-g/shared-types';
/** Screen request lifecycle; existing services/rules authorize every read. */
export function useFacilitatorResource<T>(load: (actor: AuthSession) => Promise<T>, failure: string) {
  const session = useAuthStore(s=>s.session), status = useAuthStore(s=>s.status);
  const generation = useRef(0), loader = useRef(load); loader.current=load;
  const [state,setState] = useState<{owner: AuthSession | null; data: T | null; loading: boolean; error: string | null}>({owner:null,data:null,loading:true,error:null});
  const authorized = status==='authenticated' && !!session && ['facilitator','super_admin'].includes(session.role);
  const reload = useCallback(async()=>{
    const token=++generation.current;
    const current=()=>token===generation.current && useAuthStore.getState().session===session && useAuthStore.getState().status==='authenticated';
    setState({owner:session,data:null,loading:authorized,error:null});
    if(!authorized || !session)return;
    try { const data=await loader.current(session);if(current())setState({owner:session,data,loading:false,error:null}); }
    catch {if(current())setState({owner:session,data:null,loading:false,error:failure});}
  },[session,status,authorized,failure]);
  useFocusEffect(useCallback(()=>{void reload();const sub=AppState.addEventListener('change',s=>{if(s==='active')void reload();});return()=>{generation.current++;sub.remove();};},[reload]));
  return { session, authorized, data: authorized && state.owner===session ? state.data : null, loading:authorized && (state.owner!==session || state.loading), error:state.owner===session?state.error:null,reload,
    isCurrent:()=>authorized && useAuthStore.getState().session===session && useAuthStore.getState().status==='authenticated' };
}
