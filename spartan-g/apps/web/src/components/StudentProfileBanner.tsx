import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { profileRepository } from '@spartan-g/shared-services';
import type { ProfileDocument } from '@spartan-g/shared-types';
import { useAuth } from '../hooks/useAuth';
import { useCampuses } from '../hooks/useCampuses';
export function StudentProfileBanner(){
 const {user}=useAuth();const {campuses}=useCampuses();const [profile,setProfile]=useState<ProfileDocument|null>(null);const [failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;setProfile(null);setFailed(false);if(user?.uid)profileRepository.getById(user.uid).then(p=>{if(active)setProfile(p)}).catch(()=>{if(active)setFailed(true)});return()=>{active=false};},[user?.uid]);
 const campus=profile?.campus||user?.campus;const campusLabel=campuses.find(c=>c.key===campus)?.label||campus||'Not set';
 const initials=(user?.displayName||'Student').split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('').toUpperCase();
 return <section className="student-profile-banner" aria-labelledby="sd-hero-heading"><div className="student-profile-main"><div className="student-monogram" aria-hidden="true">{initials}</div><div><p className="student-eyebrow">Your student guidance space</p><h1 id="sd-hero-heading">{user?.displayName||'Student'}</h1><p className="student-email">{user?.email}</p><span className="student-role-pill">Student portal</span></div></div><dl className="student-profile-meta"><div><dt>Campus</dt><dd>{campusLabel}</dd></div><div><dt>Institution</dt><dd>{profile?.institution||'Not set'}</dd></div><div><dt>Your next step</dt><dd>At your pace.</dd></div></dl><div className="student-profile-footer"><p>{failed?'Some profile details could not load. View your profile to check them.':'Welcome back. Make a little space for yourself today.'}</p><Link className="student-soft-button" to="/student/profile">View profile <span aria-hidden="true">→</span></Link></div></section>;
}
