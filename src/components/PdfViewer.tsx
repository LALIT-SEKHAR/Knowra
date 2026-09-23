import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import { getToken } from '../services/api';
import { isImageMime } from '../utils/fileTypes';
import { PdfPageSkeleton, PdfStageSkeleton } from './Skeleton';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

const WORKER_SRC = '/pdf.worker.min.mjs';

function ensurePdfWorker() {
  if (pdfjs.GlobalWorkerOptions.workerSrc !== WORKER_SRC) {
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  }
}

type Props = {
  documentId: string;
  mimeType?: string;
  highlightPage?: number | null;
  label?: string;
  onClose?: () => void;
};

function measureStageWidth(stage: HTMLElement) {
  const styles = getComputedStyle(stage);
  const padX =
    (Number.parseFloat(styles.paddingLeft) || 0) +
    (Number.parseFloat(styles.paddingRight) || 0);
  const available = stage.clientWidth - padX;
  if (available > 40) return Math.floor(available);
  return Math.min(640, Math.max(280, Math.floor(window.innerWidth * 0.42)));
}

export function PdfViewer({ documentId, mimeType, highlightPage, label, onClose }: Props) {
  const image = isImageMime(mimeType);
  if (!image) ensurePdfWorker();

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState('');
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(true);
  const [pageWidth, setPageWidth] = useState(() =>
    typeof window !== 'undefined' ? Math.min(640, Math.floor(window.innerWidth * 0.42)) : 480,
  );
  const pdfFile = useMemo(() => (pdfData ? { data: pdfData } : null), [pdfData]);
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useLayoutEffect(() => {
    if (!image) ensurePdfWorker();
  }, [image]);

  useEffect(() => {
    let cancelled = false;
    setPdfData(null);
    setImageUrl(null);
    setNumPages(0);
    setPageNumber(1);
    setError('');
    setLoadingFile(true);
    pageRefs.current.clear();

    async function loadFile() {
      try {
        if (!image) ensurePdfWorker();
        const base = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
        const token = getToken();
        const res = await fetch(`${base}/documents/${documentId}/file`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error(`Failed to load file (${res.status})`);
        }
        if (image) {
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          setImageUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return url;
          });
        } else {
          const buffer = await res.arrayBuffer();
          if (cancelled) return;
          // Copy so pdf.js can transfer ownership without detaching our state reference issues
          setPdfData(buffer.slice(0));
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(err instanceof Error ? err.message : 'Failed to load preview');
        }
      } finally {
        if (!cancelled) setLoadingFile(false);
      }
    }

    void loadFile();
    return () => {
      cancelled = true;
      setImageUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [documentId, image]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateWidth = () => {
      const next = measureStageWidth(stage);
      setPageWidth((prev) => (Math.abs(prev - next) > 2 ? next : prev));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(stage);
    window.addEventListener('resize', updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [documentId, pdfData]);

  useEffect(() => {
    if (!highlightPage || highlightPage < 1) return;
    const target = numPages ? Math.min(highlightPage, numPages) : highlightPage;
    setPageNumber(target);
    requestAnimationFrame(() => {
      pageRefs.current.get(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [highlightPage, numPages]);

  const setPageRef = useCallback((page: number, node: HTMLDivElement | null) => {
    if (node) pageRefs.current.set(page, node);
    else pageRefs.current.delete(page);
  }, []);

  useEffect(() => {
    if (!numPages || !stageRef.current) return;
    const stage = stageRef.current;

    const update = () => {
      const stageTop = stage.getBoundingClientRect().top;
      const marker = stageTop + Math.min(96, stage.clientHeight * 0.22);
      let current = 0;
      pageRefs.current.forEach((el, page) => {
        const rect = el.getBoundingClientRect();
        if (rect.top <= marker && rect.bottom > stageTop + 4) current = page;
      });
      if (current) setPageNumber((prev) => (prev === current ? prev : current));
    };

    update();
    stage.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    pageRefs.current.forEach((el) => observer.observe(el));
    return () => {
      stage.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [numPages, pageWidth]);

  function goToPage(next: number) {
    const clamped = Math.min(Math.max(1, next), Math.max(numPages, 1));
    setPageNumber(clamped);
    pageRefs.current.get(clamped)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="chrome-bar flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-[var(--color-line)] px-3 py-2 text-sm">
        <span className="inline-flex min-w-0 flex-1 basis-36 items-center gap-1.5 font-medium text-[var(--color-ink-muted)]">
          <FileText className="icon shrink-0" aria-hidden />
          <span className="truncate text-[var(--color-ink)]">{label ?? (image ? 'Image' : 'Document')}</span>
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
              <span className="min-w-12 text-center text-xs tabular-nums text-[var(--color-ink-muted)]">
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

      <div ref={stageRef} className="pdf-stage min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4">
        {error ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : image ? (
          loadingFile || !imageUrl ? (
            <PdfStageSkeleton />
          ) : (
            <img
              src={imageUrl}
              alt="Uploaded image"
              className="mx-auto max-h-full max-w-full rounded-[var(--radius-control)] bg-white object-contain shadow-[0_16px_40px_-24px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
            />
          )
        ) : loadingFile || !pdfData ? (
          <PdfStageSkeleton />
        ) : (
          <Document
            key={documentId}
            file={pdfFile}
            suspense={false}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              setPageNumber((p) => Math.min(Math.max(1, p), n));
            }}
            onLoadError={(err) => {
              console.error(err);
              setError('Failed to parse PDF preview');
            }}
            loading={<PdfStageSkeleton />}
            className="pdf-document mx-auto flex w-full flex-col items-center gap-3"
          >
            {Array.from({ length: numPages }, (_, i) => {
              const page = i + 1;
              return (
                <div
                  key={`${documentId}-${page}`}
                  ref={(node) => setPageRef(page, node)}
                  data-page={page}
                  className="pdf-page-frame overflow-hidden rounded-[var(--radius-control)] bg-white shadow-[0_16px_40px_-24px_rgba(0,0,0,0.8)] ring-1 ring-white/10"
                  style={{ width: pageWidth }}
                >
                  <Page
                    pageNumber={page}
                    width={pageWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={
                      <PdfPageSkeleton width={pageWidth} height={Math.round(pageWidth * 1.3)} />
                    }
                  />
                </div>
              );
            })}
          </Document>
        )}
      </div>
    </div>
  );
}
