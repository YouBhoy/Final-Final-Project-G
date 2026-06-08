import { useEffect, type ReactNode } from 'react';

import { useAuthStore } from '@/store/auth.store';
import { notificationService } from '@/services/notification.service';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const initialize = useAuthStore((s) => s.initialize);
  const session = useAuthStore((s) => s.session);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  useEffect(() => {
    if (status === 'authenticated' && session?.uid) {
      notificationService.registerDevice(session.uid).catch(() => {
        // Push registration is non-blocking
      });
    }
  }, [status, session?.uid]);

  return <>{children}</>;
}
