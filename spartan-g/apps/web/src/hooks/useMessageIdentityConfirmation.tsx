import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from './useAuth';

/** A canceled confirmation leaves both the draft and identity-sharing state unchanged. */
export function useMessageIdentityConfirmation(conversationId: string, participantId: string) {
  const { user } = useAuth();
  const scope = JSON.stringify([user?.uid, conversationId, participantId]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const acknowledged = useRef<string | null>(null);
  const pending = useRef<{ scope: string; resolve: (accepted: boolean) => void } | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const cancel = useCallback(() => {
    pending.current?.resolve(false);
    pending.current = null;
    setOpenFor(null);
  }, []);
  useEffect(() => cancel, [scope, cancel]);
  const requestConfirmation = useCallback((): Promise<boolean> => {
    if (user?.role !== 'student' || acknowledged.current === scope) return Promise.resolve(true);
    if (pending.current) return Promise.resolve(false);
    return new Promise(resolve => {
      pending.current = { scope, resolve };
      setOpenFor(scope);
    });
  }, [scope, user?.role]);
  function confirm() {
    const request = pending.current;
    if (!request || request.scope !== currentScope.current) { cancel(); return; }
    acknowledged.current = request.scope;
    pending.current = null;
    setOpenFor(null);
    request.resolve(true);
  }
  const confirmation = <Modal open={openFor === scope} onClose={cancel} title="Reveal your name to this facilitator?" size="md">
    <p className="text-sm leading-6 text-gray-700">Messaging this facilitator will reveal your name and email address to them. Continue only if you want to share your identity and send this message.</p>
    <div className="mt-5 flex justify-end gap-3">
      <button type="button" onClick={cancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium">Cancel</button>
      <button type="button" onClick={confirm} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">Continue and send</button>
    </div>
  </Modal>;
  return { requestConfirmation, confirmation };
}
