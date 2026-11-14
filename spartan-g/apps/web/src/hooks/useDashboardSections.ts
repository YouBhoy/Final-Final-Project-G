import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardError } from '../lib/dashboardData';

export type DashboardSection<T> = { data: T | null; loading: boolean; error: string | null };
export type DashboardSections<T> = { [K in keyof T]: DashboardSection<T[K]> };
export function useDashboardSections<T extends object>(scope: string | null, loaders: { [K in keyof T]: () => Promise<T[K]> }) {
  const initial = () => Object.fromEntries(Object.keys(loaders).map(key => [key, { data: null, loading: !!scope, error: null }])) as DashboardSections<T>;
  const [state, setState] = useState(() => ({ scope, sections: initial() }));
  const [revision, setRevision] = useState(0);
  const current = useRef(scope);
  const versions = useRef(new Map<keyof T, number>());
  current.current = scope;
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const fail = useCallback((key: keyof T, cause: unknown) => {
    if (current.current !== scope) return;
    versions.current.set(key, (versions.current.get(key) ?? 0) + 1);
    setState(previous => previous.scope === current.current ? { ...previous, sections: { ...previous.sections, [key]: { data: null, loading: false, error: dashboardError(cause) } } } : previous);
  }, [scope]);
  useEffect(() => {
    let active = true;
    const pending = new Set<keyof T>();
    setState({ scope, sections: initial() });
    if (scope) for (const key of Object.keys(loaders) as (keyof T)[]) {
      pending.add(key);
      const version = (versions.current.get(key) ?? 0) + 1;
      versions.current.set(key, version);
      void Promise.resolve().then(loaders[key]).then(data => {
        if (active && current.current === scope && pending.has(key) && versions.current.get(key) === version)
          setState(previous => ({ scope, sections: { ...previous.sections, [key]: { data, loading: false, error: null } } }));
      }, cause => {
        if (active && current.current === scope) fail(key, cause);
      });
    }
    return () => { active = false; pending.clear(); };
  }, [scope, loaders, revision, fail]);
  // Mask old-account data during render, before effect cleanup runs.
  const sections = state.scope === scope ? state.sections : initial();
  const values = Object.values(sections) as DashboardSection<unknown>[];
  return { sections, reload, fail, loading: values.some(item => item.loading), error: values.find(item => item.error)?.error ?? null };
}
