import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import { getToken } from '../services/api';
import { isExcelMime } from '../utils/fileTypes';
import { sanitizePreviewHtml } from '../utils/previewHtml';
import { DocxPreview } from './DocxPreview';
import { PdfStageSkeleton } from './Skeleton';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type PreviewPage = { pageNumber: number; html: string };

type Props = {
  documentId: string;
  mimeType?: string;
  highlightPage?: number | null;
  label?: string;
  onClose?: () => void;
};

export function OfficePreview(props: Props) {
  if (props.mimeType === DOCX_MIME) return <DocxPreview {...props} />;
  return <OfficeHtmlPreview {...props} />;
}

function OfficeHtmlPreview({ documentId, mimeType, highlightPage, label, onClose }: Props) {
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
          pages?: Array<{ pageNumber: number; html?: string; text?: string }>;
          tooLarge?: boolean;
        };
        if (!res.ok) throw new Error(data.error || `Failed to load file (${res.status})`);
        if (cancelled) return;
        setTooLarge(Boolean(data.tooLarge));
        setPages(
          (data.pages ?? [])
            .map((page) => ({
              pageNumber: page.pageNumber,
              html:
                page.html ||
                (page.text
                  ? `<p>${page.text
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/\n/g, '<br>')}</p>`
                  : ''),
            }))
            .filter((page) => page.html),
        );
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
  const html = useMemo(
    () => (current?.html ? sanitizePreviewHtml(current.html) : ''),
    [current?.html],
  );

  function showIndex(next: number) {
    const page = pages[next];
    if (page) setPageNumber(page.pageNumber);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="chrome-bar flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-[var(--color-line)] px-3 py-2 text-sm">
        <span className="inline-flex min-w-0 flex-1 basis-36 items-center gap-1.5 font-medium text-[var(--color-ink-muted)]">
          <FileText className="icon shrink-0" aria-hidden />
          <span className="truncate text-[var(--color-ink)]">
            {label ?? (sheet ? 'Spreadsheet' : 'Document')}
          </span>
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
              <span className="min-w-12 text-center text-xs tabular-nums text-[var(--color-ink-muted)]">
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
      <div className="pdf-stage min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        {error ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : loading ? (
          <PdfStageSkeleton />
        ) : tooLarge ? (
          <p className="mx-auto max-w-md text-sm leading-relaxed text-[var(--color-ink-muted)]">
            This file is too large to preview here. Download it to open the original. You can still
            ask questions about it in chat.
          </p>
        ) : !html ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No readable text in this file.</p>
        ) : (
          <article
            className={clsx(
              'doc-preview mx-auto bg-white px-4 py-6 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.8)] ring-1 ring-white/10 sm:px-10 sm:py-10',
              sheet
                ? 'w-max min-w-[min(100%,42rem)] max-w-none rounded-[var(--radius-control)]'
                : 'max-w-3xl rounded-[var(--radius-control)]',
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
