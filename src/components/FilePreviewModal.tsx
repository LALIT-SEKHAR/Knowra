import { useEffect, useRef } from 'react';
import type { KnowraDocument } from '../types';
import { isOfficeMime } from '../utils/fileTypes';
import { OfficePreview } from './OfficePreview';
import { PdfViewer } from './PdfViewer';

type Props = {
  doc: KnowraDocument | null;
  onClose: () => void;
};

export function FilePreviewModal({ doc, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!doc) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [doc, onClose]);

  if (!doc) return null;

  return (
    <div className="confirm-overlay file-preview-overlay" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={doc.name}
        tabIndex={-1}
        className="file-preview-dialog glass outline-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {isOfficeMime(doc.mimeType) ? (
            <OfficePreview
              documentId={doc.id}
              mimeType={doc.mimeType}
              label={doc.name}
              onClose={onClose}
            />
          ) : (
            <PdfViewer
              documentId={doc.id}
              mimeType={doc.mimeType}
              label={doc.name}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
