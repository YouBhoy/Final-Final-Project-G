import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAuthStore, userService } from '@spartan-g/shared-services';
import type { UserDocument, ProfileDocument } from '@spartan-g/shared-types';

export type ProfilePortal = 'student' | 'facilitator';
interface AccountState { owner: string; user: UserDocument | null; profile: ProfileDocument | null; loading: boolean; error: string | null }
const Context = createContext<(AccountState & { reload: () => void }) | null>(null);
export function useProfileAccount() {
  const value = useContext(Context);
  if (!value) throw new Error('Profile account context unavailable');
  return value;
}
export function ProfileAccountProvider({ portal, children }: { portal: ProfilePortal; children: ReactNode }) {
  const session = useAuthStore(s => s.session);
  const owner = session?.role === portal ? `${portal}:${session.uid}` : '';
  const [attempt, setAttempt] = useState(0);
  const [account, setAccount] = useState<AccountState>({ owner: '', user: null, profile: null, loading: true, error: null });
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  useEffect(() => {
    let alive = true;
    if (!owner || !session) return;
    setAccount({ owner, user: null, profile: null, loading: true, error: null });
    const timeout = setTimeout(() => { if (alive) { alive = false; setAccount({ owner, user: null, profile: null, loading: false, error: 'Your profile did not respond. Check your connection and retry.' }); } }, 12000);
    Promise.all([userService.getUser(session.uid), userService.getProfile(session.uid)]).then(([user, profile]) => {
      if ((user && (user.uid !== session.uid || user.role !== session.role)) || (profile?.uid && profile.uid !== session.uid)) throw new Error('Account ownership mismatch');
      if (alive) setAccount({ owner, user, profile, loading: false, error: null });
    }).catch(() => { if (alive) setAccount({ owner, user: null, profile: null, loading: false, error: 'Your profile could not be loaded. Check your connection and account access, then retry.' }); }).finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); };
  }, [owner, attempt, session?.uid]);
  const visible = account.owner === owner && owner ? account : { owner, user: null, profile: null, loading: !!owner, error: owner ? null : 'Profile access is unavailable for this session.' };
  return <Context.Provider value={{ ...visible, reload }}>{children}</Context.Provider>;
}
