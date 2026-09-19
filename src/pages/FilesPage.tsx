import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  MessageSquare,
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

export function FilesPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<KnowraDocument[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
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
    const name = window.prompt('Rename file', doc.name);
    if (!name || name === doc.name) return;
    try {
      await api.renameDocument(doc.id, name);
      await load(query || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rename failed');
    }
  }

  async function onDelete(doc: KnowraDocument) {
    if (!window.confirm(`Delete ${doc.name}? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(doc.id);
      await load(query || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  async function onRetry(doc: KnowraDocument) {
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
    return (
      <div className="flex flex-wrap gap-1.5">
        <Link className="chip" to={`/?doc=${doc.id}`}>
          <ExternalLink className="icon-sm" aria-hidden />
          Open
        </Link>
        <Link className="chip" to={`/?doc=${doc.id}&chat=1`}>
          <MessageSquare className="icon-sm" aria-hidden />
          Chat
        </Link>
        <a className="chip" href={doc.cloudinaryUrl} target="_blank" rel="noreferrer">
          <Download className="icon-sm" aria-hidden />
          Download
        </a>
        <button type="button" className="chip" onClick={() => void onRename(doc)}>
          <Pencil className="icon-sm" aria-hidden />
          Rename
        </button>
        {doc.status === 'failed' && (
          <button type="button" className="chip" onClick={() => void onRetry(doc)}>
            <RefreshCw className="icon-sm" aria-hidden />
            Retry
          </button>
        )}
        <button type="button" className="chip btn-danger-text" onClick={() => void onDelete(doc)}>
          <Trash2 className="icon-sm" aria-hidden />
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="page-shell relative mx-auto max-w-5xl">
      <div
        className="ambient-orb left-[-10%] top-0 bg-white/10"
        aria-hidden
      />

      <div className="relative z-10">
        <Link to="/" className="btn btn-ghost !px-0 text-sm text-[var(--color-ink-muted)]">
          <ArrowLeft className="icon" aria-hidden />
          Back to workspace
        </Link>

        <div className="glass mt-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="inline-flex items-center gap-2 font-[family-name:var(--font-display)] text-3xl tracking-tight">
                <FileText className="size-7 text-[var(--color-ink-muted)]" aria-hidden />
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

        <div className="surface mt-4 overflow-hidden">
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
                  <p className="flex items-center gap-2 font-medium">
                    <FileText className="icon shrink-0 text-[var(--color-ink-muted)]" aria-hidden />
                    <span className="truncate">{doc.name}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-ink-muted)]">
                    <StatusIcon doc={doc} />
                    {formatBytes(doc.size)} · {statusLabel(doc)} · {formatRelativeDate(doc.updatedAt)}
                  </p>
                  <div className="mt-3">
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
    </div>
  );
}
