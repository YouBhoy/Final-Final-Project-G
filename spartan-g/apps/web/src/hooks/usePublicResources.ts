import { useCallback, useEffect, useRef, useState } from 'react';
import { resourceService } from '@spartan-g/shared-services';
import type { ResourceDocument } from '@spartan-g/shared-types';
export const PUBLIC_SNAPSHOT_REFRESH_MS = 15 * 60 * 1000;
export const PUBLIC_SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000;
export type PublicResource = ResourceDocument & { id: string };
export function usePublicResources() {
 const [resources,setResources]=useState<PublicResource[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState(false);
 const [attempt,setAttempt]=useState(0);
 const retry=useCallback(()=>setAttempt(v=>v+1),[]);
 const timer=useRef<ReturnType<typeof setInterval>>();
 let displayedUpdatedAt = '';
 useEffect(()=>{let active=true;
  setLoading(resources.length===0);setError(false);
  const staticSnapshot=fetch('/resources.json',{cache:'no-store'}).then(response=>{
   if(!response.ok) throw new Error('snapshot-unavailable');
   return response.json();
  }).then((snapshot:{version:number;updatedAt:string;items:PublicResource[]})=>{
   if(!active||!Array.isArray(snapshot.items)) return;
   const age=Date.now()-Date.parse(snapshot.updatedAt);
   if(Number.isFinite(age)&&age<PUBLIC_SNAPSHOT_MAX_AGE_MS) {
    displayedUpdatedAt=Math.max(0,...snapshot.items.map(item=>{
     const value=item.updatedAt as unknown;
     const date=new Date(typeof value==='string'||typeof value==='number'?value:0);
     return Number.isFinite(date.getTime())?date.getTime():0;
    })).toString();
    setResources(snapshot.items);
   }
  }).catch(()=>undefined);
  const refresh=()=>resourceService.listPublic().then(items=>{
   if(!active)return;
   const newest=Math.max(0,...items.map(item=>{
    const value=item.updatedAt as unknown as {toDate?:()=>Date}|string|number|undefined;
    const date=typeof value==='object'&&value?.toDate?value.toDate():value instanceof Date?value:new Date(value as string|number);
    return Number.isFinite(date.getTime())?date.getTime():0;
   }));
   if(!displayedUpdatedAt||newest>=Number(displayedUpdatedAt)) {
    displayedUpdatedAt=String(newest);
    setResources(items);setError(false);
   }
  }).catch(()=>{
   if(active&&resources.length===0)setError(true);
  }).finally(()=>{if(active)setLoading(false)});
  void staticSnapshot.then(()=>{if(active)void refresh()});
  timer.current=setInterval(refresh,PUBLIC_SNAPSHOT_REFRESH_MS);
  return()=>{active=false;if(timer.current)clearInterval(timer.current)};
 },[attempt]);
 return {resources,loading,error,retry};
}
