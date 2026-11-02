import { useAuth } from '../hooks/useAuth';
import { CAMPUS_LABELS } from '@spartan-g/shared-types';
export function StaffProfileBanner({role,description,loading,onRefresh}:{role:string;description:string;loading:boolean;onRefresh:()=>void}){
 const {user}=useAuth();const name=user?.displayName||role;const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
 const campus=user?.campus?(CAMPUS_LABELS as Record<string,string>)[user.campus]||user.campus:'Platform-wide';
 return <header className="student-profile-banner staff-profile-banner"><div className="student-profile-main"><div className="student-monogram" aria-hidden="true">{initials}</div><div><p className="student-eyebrow">Your {role.toLowerCase()} workspace</p><h1>{name}</h1><p className="student-email">{user?.email}</p><span className="student-role-pill">{role} portal</span></div></div><dl className="student-profile-meta"><div><dt>{user?.campus?'Campus':'Scope'}</dt><dd>{campus}</dd></div><div><dt>Today</dt><dd>{new Date().toLocaleDateString('en-PH',{month:'long',day:'numeric',timeZone:'Asia/Manila'})}</dd></div></dl><div className="student-profile-footer"><p>{description}</p><button className="student-soft-button" disabled={loading} onClick={onRefresh}>{loading?'Refreshing…':'Refresh overview ↻'}</button></div></header>;
}
