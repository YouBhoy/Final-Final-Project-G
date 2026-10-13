import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { auth } from '../../firebase/firebase';
import { loadPrivacyPolicy, type PrivacyPolicy } from '../../lib/privacyPolicy';
import { acceptPrivacySession, privacySessionKey, readPrivacySession } from '../../lib/privacySession';

export function PrivacyConsentGate({ children, background }: { children: ReactNode; background?: ReactNode }) {
  const { user, logout } = useAuth();
  const [accepted, setAccepted] = useState(readPrivacySession);
  const [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [viewingPolicy, setViewingPolicy] = useState(false);
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const policyLink = useRef<HTMLAnchorElement>(null);
  const session = user ? privacySessionKey(user.uid, auth.currentUser?.metadata.lastSignInTime) : '';
  const required = !!user && ['student', 'facilitator'].includes(user.role) && accepted !== session;

  useEffect(() => {
    if (!required || typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [required]);

  useEffect(() => {
    if (!required) return;
    let cancelled = false;
    setPolicy(null); setError(''); setAgreed(false); setViewingPolicy(false);
    dialog.current?.focus();
    loadPrivacyPolicy().then(value => { if (!cancelled) setPolicy(value); })
      .catch(() => { if (!cancelled) setError('Unable to load the privacy policy. Please retry or choose Deny to sign out.'); });
    return () => { cancelled = true; };
  }, [required, session, retry]);

  useEffect(() => {
    if (viewingPolicy) dialog.current?.focus();
    else policyLink.current?.focus();
  }, [viewingPolicy]);

  async function deny() {
    if (busy) return;
    setBusy(true); setError('');
    try { await logout(); }
    catch { setError('Unable to sign out. Please try Deny again.'); setBusy(false); }
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); if (viewingPolicy) setViewingPolicy(false); else void deny(); }
    if (event.key !== 'Tab') return;
    const targets = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]') ?? []);
    const first = targets[0], last = targets[targets.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }
  if (!required) return <>{children}</>;

  // Show only the role's dashboard behind the dialog. The requested route stays gated.
  return (
    <>
    <div aria-hidden="true" {...{ inert: '' }} className="pointer-events-none select-none">{background}</div>
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/25 px-4 py-8 backdrop-blur-md">
      {viewingPolicy && policy ? <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="privacy-reader-title"
        onKeyDown={onKeyDown} className="relative w-full max-w-2xl rounded-2xl bg-white p-6 text-slate-800 shadow-xl outline-none sm:p-8">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 id="privacy-reader-title" className="text-xl font-semibold">{policy.title}</h2>
          <button type="button" aria-label="Close privacy policy" onClick={() => setViewingPolicy(false)} className="rounded-lg px-3 py-2 text-slate-500 hover:bg-slate-100">Close</button>
        </div>
        <div id="privacy-policy-body" tabIndex={0} role="region" aria-label="Privacy policy body"
          className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap border-y border-slate-200 py-5 pr-4 text-sm leading-7 text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500">{policy.body}</div>
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => setViewingPolicy(false)} className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700">Back to agreement</button></div>
      </div> : <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="privacy-title"
        aria-describedby="privacy-intro" onKeyDown={onKeyDown}
        className="relative w-full max-w-xl rounded-2xl bg-white px-6 py-8 text-slate-800 shadow-xl outline-none sm:px-10 sm:py-10">
        <button type="button" aria-label="Deny privacy policy and sign out" disabled={busy} onClick={() => void deny()}
          className="absolute right-4 top-3 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
        <div className="mb-4 flex flex-col items-center gap-5 text-center">
          <svg className="h-14 w-14 text-emerald-500" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m32 5 25 27-25 27L7 32 32 5Z" /><path d="m32 12 18 20-18 20-18-20 18-20Z" /><path d="M26 23h12M22 29h20M22 35h20M27 41h10" />
          </svg>
          <h1 id="privacy-title" className="text-2xl font-medium tracking-tight text-slate-950">Before you continue</h1>
        </div>
        <p id="privacy-intro" className="mb-6 text-center text-sm text-slate-500">Please read our privacy policy before continuing to SPARTAN-G.</p>
        <p className="border-y border-slate-200 py-5 text-sm leading-7 text-slate-600">
          SPARTAN-G is not a medical or diagnostic tool. It supports wellbeing awareness and guidance. Our goal is not to diagnose you. Scores, risk indicators, and AI summaries are not diagnoses and do not replace evaluation by a qualified healthcare professional.
        </p>
        {!policy && !error && <p role="status" className="py-4 text-center text-sm">Loading privacy policy...</p>}
        {error && <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}
          {!policy && <button className="ml-2 underline" disabled={busy} onClick={() => setRetry(value => value + 1)}>Retry</button>}
        </div>}
        <label className="mt-6 flex cursor-pointer items-start justify-center gap-3 text-sm leading-6 text-slate-700">
          <input type="checkbox" checked={agreed} disabled={!policy || busy} onChange={event => setAgreed(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600 focus:ring-2 focus:ring-emerald-500" />
          <span>I have read and agree to <a ref={policyLink} href="#privacy-policy-body" onClick={event => {
            event.preventDefault();
            if (policy && !busy) setViewingPolicy(true);
          }} className="rounded font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600">{policy?.title ?? 'the Privacy Policy'}</a>.</span>
        </label>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" disabled={busy} onClick={() => void deny()}
            className="rounded-full border border-slate-300 px-6 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50">{busy ? 'Signing out...' : 'Deny'}</button>
          <button type="button" disabled={!policy || !agreed || busy} onClick={() => { if (!policy || !agreed || busy) return; acceptPrivacySession(session); setAccepted(session); }}
            className="rounded-full bg-emerald-600 px-8 py-3 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">I Agree</button>
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">Deny signs you out. You will be asked again at your next login.</p>
      </div>}
    </div>
    </>
  );
}
