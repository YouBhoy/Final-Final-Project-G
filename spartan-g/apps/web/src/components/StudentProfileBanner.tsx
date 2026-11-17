import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { profileRepository } from '@spartan-g/shared-services';
import type { ProfileDocument } from '@spartan-g/shared-types';
import { useAuth } from '../hooks/useAuth';
import { useCampuses } from '../hooks/useCampuses';
import { Avatar } from './ui/Avatar';

export function StudentProfileBanner() {
  const { user } = useAuth();
  const { campuses } = useCampuses();
  const [profile, setProfile] = useState<ProfileDocument | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setProfile(null);
    setFailed(false);
    if (user?.uid) profileRepository.getById(user.uid).then((value) => {
      if (active) setProfile(value);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [user?.uid]);

  const campus = profile?.campus || user?.campus;
  const campusLabel = campuses.find((item) => item.key === campus)?.label || campus || 'Not set';
  const nameParts = (user?.displayName || 'Student').trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || 'Student';
  return (
    <section className="student-profile-banner student-glass student-glass-hero" aria-labelledby="sd-hero-heading">
      <div className="student-profile-main">
        <Avatar name={user?.displayName || 'Student'} size="hero" shape="tile" className="student-monogram" />
        <div className="student-hero-copy">
          <p className="student-eyebrow">Your student guidance space</p>
          <h1 id="sd-hero-heading">Welcome back, {firstName}</h1>
          <p className="student-email">{user?.email}</p>
          <div className="student-hero-pills"><span>{campusLabel}</span><span>Student portal</span><span>{profile?.institution || 'Institution not set'}</span></div>
        </div>
      </div>
      <div className="student-hero-next student-glass">
        <p className="student-eyebrow">Your next step</p>
        <p>{failed ? 'Some profile details could not load. View your profile to check them.' : 'At your own pace. Make a little space for yourself today.'}</p>
        <Link className="student-soft-button" to="/student/profile">View profile</Link>
      </div>
    </section>
  );
}
