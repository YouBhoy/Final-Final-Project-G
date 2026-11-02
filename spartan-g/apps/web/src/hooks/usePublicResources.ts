import { useCallback, useEffect, useState } from 'react';
import { resourceService } from '@spartan-g/shared-services';
import type { ResourceDocument } from '@spartan-g/shared-types';
export type PublicResource = ResourceDocument & { id: string };
export function usePublicResources() {
 const [resources,setResources]=useState<PublicResource[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const retry=useCallback(()=>setAttempt(v=>v+1),[]);
 useEffect(()=>{let active=true;setLoading(true);setError(false);
  resourceService.listPublic().then(items=>{if(active)setResources(items)}).catch(()=>{if(active)setError(true)}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[attempt]);
 return {resources,loading,error,retry};
}
