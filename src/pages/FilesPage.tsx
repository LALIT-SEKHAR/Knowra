import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  MessageSquare,
  MoreVertical,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { KnowraDocument } from '../types';
import { formatBytes, formatRelativeDate } from '../utils/format';
import { useAuth } from '../hooks/useAuth';
import { UserAvatar, displayName } from '../components/UserAvatar';
import { BrandMark } from '../components/BrandMark';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function FilesPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<KnowraDocument[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowraDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (q?: string) => {
    setError('');
    try {
      const res = await api.listDocuments(q);
      setDocuments(res.documents);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const hasProcessing = documents.some(
      (d) => d.status === 'processing' || d.status === 'uploading',
    );
    if (!hasProcessing) return;
    const id = setInterval(() => {
      void load(query || undefined);
    }, 2500);
    return () => clearInterval(id);
  }, [documents, load, query]);

  useEffect(() => {
    if (!openMenuId) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest(`[data-file-menu="${openMenuId}"]`)) return;
      setOpenMenuId(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenuId(null);
    }

    function onRepositionClose() {
      setOpenMenuId(null);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onRepositionClose);
    window.addEventListener('scroll', onRepositionClose, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onRepositionClose);
      window.removeEventListener('scroll', onRepositionClose, true);
    };
  }, [openMenuId]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    await load(query || undefined);
  }

  async function onUpload(file: File) {
    if (!user?.hasOpenAIKey) {
      setError('Add your OpenAI API key in Settings before uploading.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await api.uploadDocument(file);
      await load(query || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onRename(doc: KnowraDocument) {
    setOpenMenuId(null);
    const name = window.prompt('Rename file', doc.name);
    if (!name || name === doc.name) return;
    try {
      await api.renameDocument(doc.id, name);
      await load(query || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rename failed');
    }
  }

  function requestDelete(doc: KnowraDocument) {
    setOpenMenuId(null);
    setDeleteTarget(doc);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    try {
      await api.deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
      await load(query || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onRetry(doc: KnowraDocument) {
    setOpenMenuId(null);
    try {
      await api.retryDocument(doc.id);
      await load(query || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Retry failed');
    }
  }

  const rows = useMemo(() => documents, [documents]);

  function statusLabel(doc: KnowraDocument) {
    if (doc.status === 'ready') return 'Ready';
    if (doc.status === 'processing') return 'Processing…';
    if (doc.status === 'uploading') return 'Uploading…';
    if (doc.status === 'failed') {
      return `Failed${doc.errorMessage ? `: ${doc.errorMessage}` : ''}`;
    }
    return doc.status;
  }

  function StatusIcon({ doc }: { doc: KnowraDocument }) {
    if (doc.status === 'ready') {
      return <CheckCircle2 className="icon-sm text-[var(--color-accent)]" aria-hidden />;
    }
    if (doc.status === 'failed') {
      return <XCircle className="icon-sm text-[var(--color-danger)]" aria-hidden />;
    }
    return <LoaderCircle className="icon-sm animate-spin text-[var(--color-ink-muted)]" aria-hidden />;
  }

  function DocActions({ doc }: { doc: KnowraDocument }) {
    const open = openMenuId === doc.id;
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

    useLayoutEffect(() => {
      if (!open || !buttonRef.current) {
        setMenuPos(null);
        return;
      }

      const rect = buttonRef.current.getBoundingClientRect();
      // Mobile + desktop rows both mount; skip the hidden trigger (rect is 0×0).
      if (rect.width < 1 || rect.height < 1) {
        setMenuPos(null);
        return;
      }

      const menuWidth = 168;
      const gap = 6;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        window.innerWidth - menuWidth - 8,
      );
      const top = Math.min(rect.bottom + gap, window.innerHeight - 8);
      setMenuPos({ top, left });
    }, [open]);

    const menu = open && menuPos
      ? createPortal(
          <div
            className="file-action-menu"
            role="menu"
            aria-label={`Actions for ${doc.name}`}
            data-file-menu={doc.id}
            style={{ top: menuPos.top, left: menuPos.left }}
          >
            <Link
              role="menuitem"
              className="file-action-item"
              to={`/?doc=${doc.id}`}
              onClick={() => setOpenMenuId(null)}
            >
              <ExternalLink className="icon-sm" aria-hidden />
              Open
            </Link>
            <Link
              role="menuitem"
              className="file-action-item"
              to={`/?doc=${doc.id}&chat=1`}
              onClick={() => setOpenMenuId(null)}
            >
              <MessageSquare className="icon-sm" aria-hidden />
              Chat
            </Link>
            <a
              role="menuitem"
              className="file-action-item"
              href={doc.cloudinaryUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpenMenuId(null)}
            >
              <Download className="icon-sm" aria-hidden />
              Download
            </a>
            <button
              type="button"
              role="menuitem"
              className="file-action-item"
              onClick={() => void onRename(doc)}
            >
              <Pencil className="icon-sm" aria-hidden />
              Rename
            </button>
            {doc.status === 'failed' && (
              <button
                type="button"
                role="menuitem"
                className="file-action-item"
                onClick={() => void onRetry(doc)}
              >
                <RefreshCw className="icon-sm" aria-hidden />
                Retry
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="file-action-item file-action-item-danger"
              onClick={() => requestDelete(doc)}
            >
              <Trash2 className="icon-sm" aria-hidden />
              Delete
            </button>
          </div>,
          document.body,
        )
      : null;

    return (
      <div className="inline-flex" data-file-menu={doc.id}>
        <button
          ref={buttonRef}
          type="button"
          className="chip chip-icon"
          aria-label={`Actions for ${doc.name}`}
          aria-haspopup="menu"
          aria-expanded={open && Boolean(menuPos)}
          onClick={() => setOpenMenuId(open ? null : doc.id)}
        >
          <MoreVertical className="icon-sm" aria-hidden />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div className="page-shell relative mx-auto max-w-5xl">
      <div className="ambient-orb left-[-10%] top-0 bg-white/10" aria-hidden />

      <div className="relative z-10">
        <Link to="/" className="btn btn-ghost !px-0 text-sm text-[var(--color-ink-muted)]">
          <ArrowLeft className="icon" aria-hidden />
          Back to workspace
        </Link>

        <div className="glass mt-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-3xl tracking-tight">
                <BrandMark size="sm" showWordmark={false} />
                Files
              </h1>
              <p className="mt-1 text-[var(--color-ink-muted)]">Manage your PDF documents</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/profile"
                className="inline-flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-[var(--color-ink-muted)] transition-colors hover:bg-white/[0.04] hover:text-[var(--color-ink)]"
                title="Edit profile"
              >
                <UserAvatar user={user} size="sm" />
                <span className="hidden sm:inline">{displayName(user)}</span>
              </Link>
              <form onSubmit={onSearch} className="flex gap-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 icon -translate-y-1/2 text-[var(--color-ink-muted)]"
                    aria-hidden
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search files"
                    className="field !min-h-11 !pl-10 w-44 sm:w-56"
                  />
                </div>
                <button type="submit" className="btn btn-secondary">
                  <Search className="icon" aria-hidden />
                  Search
                </button>
              </form>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn btn-primary"
              >
                {uploading ? (
                  <LoaderCircle className="icon animate-spin" aria-hidden />
                ) : (
                  <Upload className="icon" aria-hidden />
                )}
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onUpload(file);
                }}
              />
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-[var(--color-danger)]">{error}</p>}
        </div>

        <div className="surface mt-4">
          <ul className="divide-y divide-[var(--color-line)] md:hidden">
            {loading ? (
              <li className="flex items-center gap-2 px-4 py-8 text-sm text-[var(--color-ink-muted)]">
                <LoaderCircle className="icon animate-spin" aria-hidden />
                Loading…
              </li>
            ) : rows.length === 0 ? (
              <li className="px-4 py-8 text-sm text-[var(--color-ink-muted)]">
                No files yet. Upload a PDF to get started.
              </li>
            ) : (
              rows.map((doc) => (
                <li key={doc.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        <FileText className="icon shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                        <span className="truncate">{doc.name}</span>
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
                        <StatusIcon doc={doc} />
                        {formatBytes(doc.size)} · {statusLabel(doc)} ·{' '}
                        {formatRelativeDate(doc.updatedAt)}
                      </p>
                    </div>
                    <DocActions doc={doc} />
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--color-line)] text-[var(--color-ink-muted)]">
                <tr>
                  <th className="px-4 py-3.5 font-medium">Name</th>
                  <th className="px-4 py-3.5 font-medium">Type</th>
                  <th className="px-4 py-3.5 font-medium">Size</th>
                  <th className="px-4 py-3.5 font-medium">Status</th>
                  <th className="px-4 py-3.5 font-medium">Modified</th>
                  <th className="px-4 py-3.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-[var(--color-ink-muted)]">
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle className="icon animate-spin" aria-hidden />
                        Loading…
                      </span>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-[var(--color-ink-muted)]">
                      No files yet. Upload a PDF to get started.
                    </td>
                  </tr>
                ) : (
                  rows.map((doc) => (
                    <tr key={doc.id} className="border-t border-[var(--color-line)]">
                      <td className="px-4 py-3.5">
                        <span className="inline-flex max-w-xs items-center gap-2 font-medium">
                          <FileText className="icon shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                          <span className="truncate">{doc.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5">PDF</td>
                      <td className="px-4 py-3.5">{formatBytes(doc.size)}</td>
                      <td
                        className={`px-4 py-3.5 ${doc.status === 'failed' ? 'text-[var(--color-danger)]' : ''}`}
                      >
                        <span className="inline-flex items-center gap-1.5 capitalize">
                          <StatusIcon doc={doc} />
                          {statusLabel(doc)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">{formatRelativeDate(doc.updatedAt)}</td>
                      <td className="px-4 py-3.5">
                        <DocActions doc={doc} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete file?"
        description={
          deleteTarget
            ? `Delete “${deleteTarget.name}”? This removes the PDF, chats, and embeddings permanently.`
            : ''
        }
        confirmLabel="Delete"
        danger
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </div>
  );
}
