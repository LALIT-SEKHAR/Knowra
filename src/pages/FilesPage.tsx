import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../services/api';
import type { KnowraDocument } from '../types';
import { formatBytes, formatRelativeDate } from '../utils/format';
import { useAuth } from '../hooks/useAuth';

export function FilesPage() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<KnowraDocument[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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
    setUploadProgress(30);
    setError('');
    try {
      setUploadProgress(70);
      await api.uploadDocument(file);
      setUploadProgress(100);
      await load(query || undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setUploadProgress(0);
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/" className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
        ← Back to workspace
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl">Files</h1>
          <p className="mt-1 text-[var(--color-ink-muted)]">Manage your PDF documents</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form onSubmit={onSearch} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files"
              className="border border-[var(--color-line)] bg-white px-3 py-2 outline-none focus:border-[var(--color-accent)]"
            />
            <button type="submit" className="border border-[var(--color-line)] px-3 py-2">
              Search
            </button>
          </form>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-[var(--color-accent)] px-4 py-2 text-white disabled:opacity-60"
          >
            {uploading ? `Uploading… ${uploadProgress}%` : '+ Upload'}
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

      <div className="mt-6 overflow-x-auto border border-[var(--color-line)] bg-[var(--color-panel)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--color-line)] text-[var(--color-ink-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Modified</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-[var(--color-ink-muted)]">
                  Loading…
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
                  <td className="px-4 py-3">{doc.name}</td>
                  <td className="px-4 py-3">PDF</td>
                  <td className="px-4 py-3">{formatBytes(doc.size)}</td>
                  <td className="px-4 py-3 capitalize">
                    {doc.status === 'ready' && 'Ready ✓'}
                    {doc.status === 'processing' && 'Processing…'}
                    {doc.status === 'uploading' && 'Uploading…'}
                    {doc.status === 'failed' && (
                      <span className="text-[var(--color-danger)]">
                        Failed{doc.errorMessage ? `: ${doc.errorMessage}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{formatRelativeDate(doc.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link className="underline" to={`/?doc=${doc.id}`}>
                        Open
                      </Link>
                      <Link className="underline" to={`/?doc=${doc.id}&chat=1`}>
                        Chat
                      </Link>
                      <a className="underline" href={doc.cloudinaryUrl} target="_blank" rel="noreferrer">
                        Download
                      </a>
                      <button type="button" className="underline" onClick={() => void onRename(doc)}>
                        Rename
                      </button>
                      {doc.status === 'failed' && (
                        <button type="button" className="underline" onClick={() => void onRetry(doc)}>
                          Retry
                        </button>
                      )}
                      <button type="button" className="underline text-[var(--color-danger)]" onClick={() => void onDelete(doc)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
