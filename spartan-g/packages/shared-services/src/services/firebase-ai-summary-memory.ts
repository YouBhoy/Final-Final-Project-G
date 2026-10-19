// Ephemeral, bounded cache; no persistent storage, network or credentials.
export interface SummaryCacheTicket { scope: string; epoch: number }
export function createSummaryMemoryCache() {
  let scope: string | null = null, epoch = 0;
  const values = new Map<string, string>(), pending = new Map<string, Promise<string>>();
  function clear() { values.clear(); pending.clear(); scope = null; epoch++; }
  function current(ticket: SummaryCacheTicket) { return scope === ticket.scope && epoch === ticket.epoch; }
  return {
    clear, current,
    enter(next: string): SummaryCacheTicket { if (next !== scope) { clear(); scope = next; } return { scope: next, epoch }; },
    read(ticket: SummaryCacheTicket, key: string) { return current(ticket) ? values.get(key) ?? null : null; },
    write(ticket: SummaryCacheTicket, key: string, text: string) {
      if (!current(ticket)) return;
      if (!values.has(key) && values.size >= 16) values.delete(values.keys().next().value!);
      values.set(key, text);
    },
    flight(ticket: SummaryCacheTicket, key: string) { return current(ticket) ? pending.get(key) : undefined; },
    track(ticket: SummaryCacheTicket, key: string, promise: Promise<string>) { if (current(ticket)) pending.set(key, promise); },
    untrack(ticket: SummaryCacheTicket, key: string, promise: Promise<string>) {
      if (current(ticket) && pending.get(key) === promise) pending.delete(key);
    },
  };
}
