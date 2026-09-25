import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import clsx from 'clsx';
import { UserAvatar } from './UserAvatar';

type Person = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

export function MemberPicker({
  people,
  value,
  onChange,
  disabled,
}: {
  people: Person[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = people.find((person) => person.id === value) ?? null;
  const needle = query.trim().toLowerCase();
  const matches = people.filter((person) => {
    if (!needle) return true;
    return (
      (person.name ?? '').toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle)
    );
  });

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <button
        type="button"
        className="field flex items-center gap-2 text-left"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setQuery('');
          setOpen((current) => !current);
        }}
      >
        {selected ? <UserAvatar user={selected} className="!size-6 !text-[10px]" /> : null}
        <span className={clsx('min-w-0 flex-1 truncate', !selected && 'text-[var(--color-ink-muted)]')}>
          {selected ? selected.name || selected.email : 'Choose a member'}
        </span>
        <ChevronDown className="icon-sm shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
      </button>
      {open ? (
        <div
          className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-panel)] p-1.5 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.85)]"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 icon-sm -translate-y-1/2 text-[var(--color-ink-muted)]"
              aria-hidden
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="field !pl-9"
              placeholder="Search by name or email"
              aria-label="Search members"
            />
          </div>
          <ul role="listbox" className="mt-1 max-h-52 overflow-auto">
            {matches.length === 0 ? (
              <li className="px-2 py-2 text-sm text-[var(--color-ink-muted)]">No one matches that search.</li>
            ) : (
              matches.map((person) => {
                const chosen = person.id === value;
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={chosen}
                      className={clsx(
                        'flex w-full items-center gap-2 rounded-[calc(var(--radius-control)-4px)] px-2 py-1.5 text-left',
                        chosen ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]',
                      )}
                      onClick={() => {
                        onChange(person.id);
                        setOpen(false);
                      }}
                    >
                      <UserAvatar user={person} className="!size-7 !text-[10px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{person.name || person.email}</span>
                        {person.name ? (
                          <span className="block truncate text-xs text-[var(--color-ink-muted)]">{person.email}</span>
                        ) : null}
                      </span>
                      {chosen ? <Check className="icon-sm shrink-0" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
