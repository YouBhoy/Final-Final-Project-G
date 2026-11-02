import { ResourceVisual } from "./ResourceVisual";
import { Link } from 'react-router-dom';
import type { PublicResource } from '../../hooks/usePublicResources';
export const resourceArt: Record<string,{symbol:string;art:string}>={guide:{symbol:'◎',art:'breathe'},video:{symbol:'▷',art:'watch'},article:{symbol:'Aa',art:'read'},worksheet:{symbol:'✳',art:'reflect'},helpline:{symbol:'↗',art:'connect'},other:{symbol:'◒',art:'pace'}};
export function ResourceCards({resources}:{resources:PublicResource[]}) {
 return <div className="library-grid">{resources.map(item=>{const art=resourceArt[item.category]||resourceArt.other;return <Link className="library-preview resource-link" aria-label={"View resource: "+item.title} to={'/resources/'+encodeURIComponent(item.id)} key={item.id}><ResourceVisual item={item} symbol={art.symbol} className={"library-art poster-"+art.art} /><span className="library-kind">{item.category}</span><h3>{item.title}</h3>{item.description&&<p>{item.description}</p>}<span className="resource-open">View resource <span aria-hidden="true">→</span></span></Link>})}</div>;
}
export function safeResourceUrl(value?:string|null) {
 if(!value)return null;
 try {const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;} catch{return null;}
}
