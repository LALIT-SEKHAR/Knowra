import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import { getToken } from '../services/api';
import { isExcelMime } from '../utils/fileTypes';
import { PdfStageSkeleton } from './Skeleton';

type PreviewPage = { pageNumber: number; text: string };

type Props = {
  documentId: string;
  mimeType?: string;
  highlightPage?: number | null;
  onClose?: () => void;
};

export function OfficePreview({ documentId, mimeType, highlightPage, onClose }: Props) {
  const sheet = isExcelMime(mimeType);
  const [pages, setPages] = useState<PreviewPage[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [tooLarge, setTooLarge] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const highlightRef = useRef(highlightPage);

  useEffect(() => {
    highlightRef.current = highlightPage;
    if (highlightPage && highlightPage > 0) setPageNumber(highlightPage);
  }, [documentId, highlightPage]);

  useEffect(() => {
    let cancelled = false;
    setPages([]);
    setPageNumber(1);
    setTooLarge(false);
    setError('');
    setLoading(true);

    async function load() {
      try {
        const base = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
        const token = getToken();
        const res = await fetch(`${base}/documents/${documentId}/preview`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          pages?: PreviewPage[];
          tooLarge?: boolean;
        };
        if (!res.ok) throw new Error(data.error || `Failed to load file (${res.status})`);
        if (cancelled) return;
        setTooLarge(Boolean(data.tooLarge));
        setPages(data.pages ?? []);
        const first = data.pages?.[0]?.pageNumber ?? 1;
        const preferred = highlightRef.current;
        setPageNumber(preferred && preferred > 0 ? preferred : first);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const current = pages.find((page) => page.pageNumber === pageNumber) ?? pages[0];
  const index = current ? pages.findIndex((page) => page.pageNumber === current.pageNumber) : -1;

  function showIndex(next: number) {
    const page = pages[next];
    if (page) setPageNumber(page.pageNumber);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="chrome-bar flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2.5 text-sm">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-[var(--color-ink-muted)]">
          <FileText className="icon shrink-0" aria-hidden />
          {sheet ? 'Spreadsheet' : 'Document'}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {pages.length > 1 && current && (
            <>
              <button
                type="button"
                className="btn btn-secondary !min-h-9 !px-2.5 text-xs"
                disabled={index <= 0}
                aria-label={sheet ? 'Previous sheet' : 'Previous section'}
                onClick={() => showIndex(index - 1)}
              >
                <ChevronLeft className="icon" aria-hidden />
              </button>
              <span className="min-w-[4.5rem] text-center tabular-nums text-[var(--color-ink-muted)]">
                {index + 1} / {pages.length}
              </span>
              <button
                type="button"
                className="btn btn-secondary !min-h-9 !px-2.5 text-xs"
                disabled={index < 0 || index >= pages.length - 1}
                aria-label={sheet ? 'Next sheet' : 'Next section'}
                onClick={() => showIndex(index + 1)}
              >
                <ChevronRight className="icon" aria-hidden />
              </button>
            </>
          )}
          {onClose && (
            <button
              type="button"
              className="btn btn-secondary !min-h-9 !px-2.5 text-xs"
              aria-label="Close document view"
              onClick={onClose}
            >
              <X className="icon" aria-hidden />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {error ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : loading ? (
          <PdfStageSkeleton />
        ) : tooLarge ? (
          <p className="mx-auto max-w-md text-sm leading-relaxed text-[var(--color-ink-muted)]">
            This file is too large to preview here. Download it to open the original. You can still
            ask questions about it in chat.
          </p>
        ) : !current ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No readable text in this file.</p>
        ) : (
          <article className="mx-auto max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink)]">
            {current.text}
          </article>
        )}
      </div>
    </div>
  );
}
