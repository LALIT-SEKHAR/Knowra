import { useCallback, useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import { getToken } from '../services/api';
import { PdfStageSkeleton } from './Skeleton';

const PREVIEW_MAX_BYTES = 32 * 1024 * 1024;

type Props = {
  documentId: string;
  highlightPage?: number | null;
  label?: string;
  onClose?: () => void;
};

function pageAtMarker(stage: HTMLElement, host: HTMLElement) {
  const stageTop = stage.getBoundingClientRect().top;
  const marker = stageTop + Math.min(96, stage.clientHeight * 0.22);
  const sections = host.querySelectorAll('section.docx');
  let current = 0;
  sections.forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    if (rect.top <= marker && rect.bottom > stageTop + 4) current = index + 1;
  });
  return current || 1;
}

export function DocxPreview({ documentId, highlightPage, label, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [tooLarge, setTooLarge] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!stage || !host) return;
    const page = host.querySelector('section.docx');
    if (!(page instanceof HTMLElement)) {
      host.style.zoom = '1';
      return;
    }
    host.style.zoom = '1';
    const styles = getComputedStyle(stage);
    const padX =
      (Number.parseFloat(styles.paddingLeft) || 0) +
      (Number.parseFloat(styles.paddingRight) || 0);
    const available = stage.clientWidth - padX;
    const width = page.offsetWidth;
    const scale = width > 40 && available > 40 ? Math.min(1, available / width) : 1;
    host.style.zoom = String(scale);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setNumPages(0);
    setPageNumber(1);
    setTooLarge(false);
    setError('');
    setLoading(true);
    hostRef.current?.replaceChildren();

    async function load() {
      try {
        const base = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
        const token = getToken();
        const res = await fetch(`${base}/documents/${documentId}/file`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;
        if (buffer.byteLength > PREVIEW_MAX_BYTES) {
          setTooLarge(true);
          return;
        }
        const host = hostRef.current;
        if (!host) return;
        host.replaceChildren();
        await renderAsync(buffer, host, host, {
          className: 'docx',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: false,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
        if (cancelled) {
          host.replaceChildren();
          return;
        }
        const count = host.querySelectorAll('section.docx').length;
        setNumPages(count);
        const preferred = highlightPage && highlightPage > 0 ? Math.min(highlightPage, count || 1) : 1;
        setPageNumber(preferred);
        requestAnimationFrame(() => {
          fit();
          if (preferred > 1) {
            host.querySelectorAll('section.docx')[preferred - 1]?.scrollIntoView({ block: 'start' });
          }
        });
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(err instanceof Error ? err.message : 'Failed to load preview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      hostRef.current?.replaceChildren();
    };
  }, [documentId, fit, highlightPage]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => fit());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fit, numPages]);

  useEffect(() => {
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!stage || !host || !numPages) return;
    const update = () => {
      const current = pageAtMarker(stage, host);
      setPageNumber((prev) => (prev === current ? prev : current));
    };
    update();
    stage.addEventListener('scroll', update, { passive: true });
    return () => stage.removeEventListener('scroll', update);
  }, [numPages]);

  function goToPage(next: number) {
    const clamped = Math.min(Math.max(1, next), Math.max(numPages, 1));
    setPageNumber(clamped);
    hostRef.current
      ?.querySelectorAll('section.docx')
      [clamped - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="chrome-bar flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2.5 text-sm">
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-[var(--color-ink-muted)]">
          <FileText className="icon shrink-0" aria-hidden />
          <span className="truncate text-[var(--color-ink)]">{label ?? 'Document'}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {numPages > 0 && (
            <>
              <button
                type="button"
                className="btn btn-secondary !min-h-9 !px-2.5 text-xs"
                disabled={pageNumber <= 1}
                aria-label="Previous page"
                onClick={() => goToPage(pageNumber - 1)}
              >
                <ChevronLeft className="icon" aria-hidden />
              </button>
              <span className="min-w-[4.5rem] text-center tabular-nums text-[var(--color-ink-muted)]">
                {pageNumber} / {numPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary !min-h-9 !px-2.5 text-xs"
                disabled={pageNumber >= numPages}
                aria-label="Next page"
                onClick={() => goToPage(pageNumber + 1)}
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
      <div ref={stageRef} className="pdf-stage relative min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        {error ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : tooLarge ? (
          <p className="mx-auto max-w-md text-sm leading-relaxed text-[var(--color-ink-muted)]">
            This file is too large to preview here. Download it to open the original. You can still
            ask questions about it in chat.
          </p>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 z-10 p-4 sm:p-6">
                <PdfStageSkeleton />
              </div>
            )}
            <div
              ref={hostRef}
              className="docx-preview-host mx-auto"
              style={{ visibility: loading ? 'hidden' : 'visible' }}
            />
          </>
        )}
      </div>
    </div>
  );
}
