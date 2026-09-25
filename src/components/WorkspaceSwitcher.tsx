import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../services/api';
import type { User } from '../types';
import { clearViewCache } from '../utils/viewCache';
import { UserAvatar } from './UserAvatar';

type WorkspaceOption = {
  id: string;
  name: string;
  role?: 'admin' | 'member';
  imageUrl?: string | null;
};

function markHue(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

function WorkspaceMark({
  name,
  imageUrl,
  personal,
  user,
}: {
  name: string;
  imageUrl?: string | null;
  personal?: boolean;
  user?: User | null;
}) {
  if (personal) {
    return <UserAvatar user={user} size="sm" className="!size-6 !text-[10px]" />;
  }
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="size-6 shrink-0 rounded-md object-cover ring-1 ring-[var(--color-line)]"
      />
    );
  }
  const hue = markHue(name);
  return (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold tracking-wide text-white ring-1 ring-white/15"
      style={{ background: `hsl(${hue} 42% 32%)` }}
      aria-hidden
    >
      {name.trim().slice(0, 2).toUpperCase()}
    </span>
  );
}

export function WorkspaceSwitcher({ user }: { user: User | null }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const currentId = user?.activeOrg?.id ?? 'personal';

  const options: WorkspaceOption[] = [
    { id: 'personal', name: 'Personal' },
    ...(user?.memberships ?? []).map((org) => ({
      id: org.id,
      name: org.name,
      role: org.role,
      imageUrl: org.imageUrl,
    })),
  ];
  const current = options.find((option) => option.id === currentId) ?? options[0]!;

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function choose(id: string) {
    setOpen(false);
    if (id === currentId) return;
    void api.switchOrg(id === 'personal' ? null : id).then(() => {
      clearViewCache();
      window.location.assign('/');
    });
  }

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Workspaces"
            className="fixed z-[80] overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-panel)] p-1 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.85)]"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          >
            {options.map((option) => {
              const selected = option.id === currentId;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-[calc(var(--radius-control)-4px)] px-2 py-1.5 text-left text-sm',
                    selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]',
                  )}
                  onClick={() => choose(option.id)}
                >
                  <WorkspaceMark
                    name={option.name}
                    imageUrl={option.imageUrl}
                    personal={option.id === 'personal'}
                    user={user}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  {selected ? <Check className="icon-sm shrink-0 text-[var(--color-ink)]" aria-hidden /> : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mb-2 px-1">
      <p className="mb-1 text-[13px] text-[var(--color-ink-muted)]">Workspace</p>
      <button
        ref={buttonRef}
        type="button"
        className="field flex w-full items-center gap-2 !min-h-9 !px-2 text-left text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
        onClick={() => setOpen((value) => !value)}
      >
        <WorkspaceMark
          name={current.name}
          imageUrl={current.imageUrl}
          personal={current.id === 'personal'}
          user={user}
        />
        <span className="min-w-0 flex-1 truncate">{current.name}</span>
        <ChevronDown
          className={clsx('icon-sm shrink-0 text-[var(--color-ink-muted)]', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
