import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { loadPrivacyPolicy, savePrivacyPolicy, type PrivacyPolicy } from '../../lib/privacyPolicy';

export function AdminPrivacyPage() {
  const [policy, setPolicy] = useState<PrivacyPolicy | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setPolicy(null); setError(''); setSuccess(false);
    loadPrivacyPolicy().then(value => {
      if (cancelled) return;
      setPolicy(value); setTitle(value.title); setBody(value.body);
    }).catch(() => { if (!cancelled) setError('Unable to load the privacy policy. Please retry.'); });
    return () => { cancelled = true; };
  }, [reload]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!policy) return;
    setSaving(true); setError(''); setSuccess(false);
    try {
      const updated = await savePrivacyPolicy(title, body, policy.version);
      setPolicy(updated); setTitle(updated.title); setBody(updated.body); setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save the privacy policy.'); }
    finally { setSaving(false); }
  }
  return <div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="text-2xl font-bold text-[var(--color-text)]">Privacy Policy</h1>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Edit the agreement students and facilitators see at every login or signup. Published changes appear at their next sign-in.</p></div>
    <p className="rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-950">SPARTAN-G supports wellbeing awareness and guidance; its goal is not to diagnose students. The agreement always displays a reminder that assessments, risk indicators, and AI summaries are not medical diagnoses. Keep this purpose clear in your policy wording.</p>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}
      <button type="button" disabled={saving} onClick={() => setReload(value => value + 1)} className="ml-3 underline">Reload policy</button></div>}
    {success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Privacy policy published successfully.</p>}
    {!policy ? !error && <p role="status">Loading privacy policy...</p> : <form onSubmit={save} className="space-y-5 rounded-xl border border-[var(--color-border)] bg-white p-6">
      <label className="block text-sm font-medium">Policy title
        <input required maxLength={120} value={title} disabled={saving} onChange={event => { setTitle(event.target.value); setSuccess(false); }} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
      <label className="block text-sm font-medium">Privacy body
        <textarea required maxLength={20000} rows={14} value={body} disabled={saving} onChange={event => { setBody(event.target.value); setSuccess(false); }} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 leading-6" /></label>
      <p className="text-xs text-gray-500">Plain text with paragraph breaks. {body.length.toLocaleString()} / 20,000 characters.</p>
      <Button type="submit" isLoading={saving} disabled={!title.trim() || !body.trim() || (policy.version > 0 && title === policy.title && body === policy.body)}>Publish policy</Button>
      <div className="border-t border-gray-200 pt-5"><h2 className="mb-3 text-sm font-semibold">Preview</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-800"><h3 className="mb-4 text-center text-xl font-medium">{title}</h3><p className="max-h-72 overflow-y-auto whitespace-pre-wrap border-y border-slate-200 py-4 text-sm leading-7 text-slate-600">{body}</p><p className="mt-4 text-center text-sm text-emerald-700">I have read and agree to {title}.</p></div></div>
    </form>}
  </div>;
}
