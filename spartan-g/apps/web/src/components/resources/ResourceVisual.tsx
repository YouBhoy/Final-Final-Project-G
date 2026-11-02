import { useState } from 'react';
import type { PublicResource } from '../../hooks/usePublicResources';

export function youtubeThumbnail(value?:string|null):string|null {
 if(!value)return null;
 try{
  const url=new URL(value);if(!['https:','http:'].includes(url.protocol))return null;
  const host=url.hostname.toLowerCase();const parts=url.pathname.split('/').filter(Boolean);let id:string|null=null;
  if(host==='youtu.be')id=parts[0]||null;
  else if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){
   if(url.pathname==='/watch')id=url.searchParams.get('v');
   else if(['embed','shorts','live'].includes(parts[0]))id=parts[1]||null;
  }
  return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':null;
 }catch{return null}
}

/** A thumbnail is decorative: the enclosing resource link already names the video. */
export function ResourceVisual({item,symbol,className}:{item:PublicResource;symbol:string;className:string}){
 const url=item.category==='video'?youtubeThumbnail(item.url):null;
 const [failedUrl,setFailedUrl]=useState<string|null>(null);
 return <span className={className+' resource-visual'+(url&&url!==failedUrl?' has-thumbnail':'')} aria-hidden="true">{url&&url!==failedUrl?<><img src={url} alt="" width="480" height="360" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailedUrl(url)}/><span className="video-play-badge">▶</span></>:<span className="resource-fallback">{symbol}</span>}</span>;
}
