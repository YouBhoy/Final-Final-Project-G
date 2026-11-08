import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface CampusOption {
  key: string;
  label: string;
  location?: string;
}

interface CampusComboboxProps {
  label: string;
  options: CampusOption[];
  value: string;
  onChange: (key: string) => void;
  placeholder?: string;
}

/** Bold the part of the label that matches what was typed ("Lip" in "Lipa Campus"). */
function Highlighted({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-bold text-[var(--color-text)]">{text.slice(at, at + query.length)}</strong>
      {text.slice(at + query.length)}
    </>
  );
}

/**
 * Autosuggest + autocomplete picker for a long list: type to filter, matching letters are
 * bold, the first match is pre-highlighted so Enter completes it, and it works with the
 * keyboard (arrows, Enter, Escape) and screen readers (ARIA combobox).
 */
export function CampusCombobox({ label, options, value, onChange, placeholder = 'Search campuses...' }: CampusComboboxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.key === value);
  const trimmed = query.trim();

  const matches = useMemo(() => {
    if (!trimmed) return options;
    const needle = trimmed.toLowerCase();
    const haystack = (option: CampusOption) => `${option.label} ${option.location ?? ''}`.toLowerCase();
    // Names that start with the typed text come first, like the "L → Laos, Latvia" example.
    return options
      .filter((option) => haystack(option).includes(needle))
      .sort((a, b) => Number(b.label.toLowerCase().startsWith(needle)) - Number(a.label.toLowerCase().startsWith(needle)));
  }, [options, trimmed]);

  useEffect(() => setActive(0), [trimmed, open]);

  // Close when clicking anywhere outside.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Keep the highlighted suggestion visible while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, id]);

  const choose = (option: CampusOption) => {
    onChange(option.key);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActive((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && matches[active]) {
        event.preventDefault();
        choose(matches[active]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={rootRef} className="relative mb-6">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--color-text-secondary)]">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${id}-opt-${active}` : undefined}
        autoComplete="off"
        value={open ? query : selected?.label ?? ''}
        placeholder={open ? selected?.label ?? placeholder : placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-2.5 pl-3 pr-10 text-sm text-[var(--color-text)] outline-none transition-shadow placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
      />
      <span className="pointer-events-none absolute right-3 top-[2.35rem] text-[var(--color-text-muted)]" aria-hidden="true">
        <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm text-[var(--color-text-muted)]">No campus matches "{trimmed}".</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.key}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={option.key === value}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                className={`cursor-pointer px-3 py-2.5 text-sm text-[var(--color-text-secondary)] ${
                  index === active ? 'bg-[var(--color-bg-alt)]' : ''
                } ${option.key === value ? 'font-semibold text-[var(--color-primary)]' : ''}`}
              >
                <Highlighted text={option.label} query={trimmed} />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
