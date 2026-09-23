import { useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Folder, FolderOpen } from 'lucide-react';
import type { KnowraFolder } from '../types';

export function NameDialog({
  open,
  title,
  description,
  initial = '',
  confirmLabel = 'Save',
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  initial?: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  const [name, setName] = useState(initial);
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    setName(initial);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusId = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busyRef.current) onCancelRef.current();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusId);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, initial]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={busy ? undefined : onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="confirm-dialog glass"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const next = name.trim();
          if (!next || busy) return;
          onConfirm(next);
        }}
      >
        <h2 id={titleId} className="font-[family-name:var(--font-display)] text-xl tracking-tight">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {description}
          </p>
        ) : null}
        <label className="mt-4 block text-sm font-medium">
          Name
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field mt-1.5"
            maxLength={120}
            disabled={busy}
            autoComplete="off"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export type MoveSubject = {
  kind: 'file' | 'folder';
  id: string;
  name: string;
  currentFolderId: string | null;
};

function descendantIds(rootId: string, folders: KnowraFolder[]) {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (!folder.parentId) continue;
    const list = children.get(folder.parentId) ?? [];
    list.push(folder.id);
    children.set(folder.parentId, list);
  }
  const out: string[] = [];
  const stack = [...(children.get(rootId) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }
  return out;
}

function folderTree(folders: KnowraFolder[]) {
  const byParent = new Map<string | null, KnowraFolder[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parentId) ?? [];
    list.push(folder);
    byParent.set(folder.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const rows: { folder: KnowraFolder; depth: number }[] = [];
  const seen = new Set<string>();
  function walk(parentId: string | null, depth: number) {
    for (const folder of byParent.get(parentId) ?? []) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      rows.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  }
  walk(null, 0);
  return rows;
}

export function MoveItemDialog({
  open,
  subject,
  folders,
  loading = false,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  subject: MoveSubject | null;
  folders: KnowraFolder[];
  loading?: boolean;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (folderId: string | null) => void;
}) {
  const titleId = useId();
  const [dest, setDest] = useState<string | null>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;
  const subjectKey = subject ? `${subject.kind}:${subject.id}:${subject.currentFolderId ?? ''}` : '';

  useEffect(() => {
    if (!open) return;
    setDest(subject?.currentFolderId ?? null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busyRef.current) onCancelRef.current();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, subjectKey, subject]);

  const blocked = useMemo(() => {
    if (!subject || subject.kind !== 'folder') return new Set<string>();
    return new Set([subject.id, ...descendantIds(subject.id, folders)]);
  }, [subject, folders]);

  const rows = useMemo(() => folderTree(folders), [folders]);

  if (!open || !subject) return null;

  const unchanged = dest === subject.currentFolderId;
  const destBlocked = dest !== null && blocked.has(dest);

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={busy ? undefined : onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="confirm-dialog glass"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-[family-name:var(--font-display)] text-xl tracking-tight">
          Move “{subject.name}”
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          Choose a folder. Nested folders are indented under their parent.
        </p>
        <div className="mt-4 max-h-72 overflow-auto rounded-[var(--radius-control)] border border-[var(--color-line)]">
          {loading ? (
            <p className="px-3 py-4 text-sm text-[var(--color-ink-muted)]">Loading folders…</p>
          ) : (
            <ul>
              <li>
                <button
                  type="button"
                  className={clsx(
                    'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm',
                    dest === null && 'bg-white/10',
                  )}
                  onClick={() => setDest(null)}
                >
                  <FolderOpen className="icon-sm shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">Files</span>
                  {subject.currentFolderId === null ? (
                    <span className="text-xs text-[var(--color-ink-muted)]">Current</span>
                  ) : null}
                </button>
              </li>
              {rows.map(({ folder, depth }) => {
                const disabled = blocked.has(folder.id);
                const current = subject.currentFolderId === folder.id;
                return (
                  <li key={folder.id}>
                    <button
                      type="button"
                      className={clsx(
                        'flex w-full items-center gap-2 py-2.5 pr-3 text-left text-sm',
                        dest === folder.id && 'bg-white/10',
                        disabled && 'cursor-not-allowed opacity-40',
                      )}
                      style={{ paddingLeft: `${12 + depth * 16}px` }}
                      disabled={disabled}
                      onClick={() => setDest(folder.id)}
                    >
                      <Folder className="icon-sm shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                      {current ? (
                        <span className="text-xs text-[var(--color-ink-muted)]">Current</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {error ? <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || loading || unchanged || destBlocked}
            onClick={() => onConfirm(dest)}
          >
            {busy ? 'Please wait…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  );
}
