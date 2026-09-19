import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { getToken } from '../services/api';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;


type Props = {
  documentId: string;
  highlightPage?: number | null;
};

export function PdfViewer({ documentId, highlightPage }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [error, setError] = useState('');

  const file = useMemo(() => {
    const base = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
    const token = getToken();
    return {
      url: `${base}/documents/${documentId}/file`,
      httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    };
  }, [documentId]);

  useEffect(() => {
    if (highlightPage && highlightPage >= 1) {
      setPageNumber(highlightPage);
    }
  }, [highlightPage]);

  useEffect(() => {
    setPageNumber(1);
    setNumPages(0);
    setError('');
  }, [documentId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2 text-sm">
        <span>Document viewer</span>
        {numPages > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="border border-[var(--color-line)] px-2 py-1 disabled:opacity-40"
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span>
              Page {pageNumber} / {numPages}
            </span>
            <button
              type="button"
              className="border border-[var(--color-line)] px-2 py-1 disabled:opacity-40"
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto bg-[#e8e4da] p-4">
        {error ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : (
          <Document
            file={file}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={() => setError('Failed to load PDF preview')}
            loading={<p className="text-sm text-[var(--color-ink-muted)]">Loading PDF…</p>}
          >
            <Page
              pageNumber={pageNumber}
              width={typeof window !== 'undefined' ? Math.min(640, window.innerWidth - 48) : 640}
            />
          </Document>
        )}
      </div>
    </div>
  );
}
