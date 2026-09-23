import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { copyRenderedMessage, renderedClipboard } from '../utils/copyResponse';
import { ChatMarkdown } from './ChatMarkdown';

type Props = {
  open: boolean;
  text: string;
  onClose: () => void;
};

function clip(text: string, max: number) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function openShare(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function ShareResponseDialog({ open, text, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  function answerPlain() {
    const node = previewRef.current?.querySelector('.chat-md');
    if (!(node instanceof HTMLElement)) return text;
    return renderedClipboard(node).plain;
  }

  async function onCopy() {
    const node = previewRef.current?.querySelector('.chat-md');
    if (!(node instanceof HTMLElement)) return;
    try {
      await copyRenderedMessage(node);
    } catch {
      return;
    }
    setCopied(true);
  }

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="share-sheet glass"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-[family-name:var(--font-display)] text-xl tracking-tight">
              Share answer
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">
              Send this reply on its own.
            </p>
          </div>
          <button ref={closeRef} type="button" className="share-close" aria-label="Close" onClick={onClose}>
            <X className="icon-sm" aria-hidden />
          </button>
        </div>

        <div ref={previewRef} className="share-preview">
          <ChatMarkdown content={text} />
        </div>

        <div className="share-destinations">
          <button type="button" className="share-destination" onClick={() => void onCopy()}>
            <span className="share-mark" aria-hidden>
              {copied ? <Check className="icon-sm" /> : <Copy className="icon-sm" />}
            </span>
            <span className="share-destination-label">Copy answer</span>
            <span className="share-destination-hint">{copied ? 'Copied' : 'Clipboard'}</span>
          </button>
          <button
            type="button"
            className="share-destination"
            onClick={() => openShare(`https://twitter.com/intent/tweet?text=${encodeURIComponent(clip(answerPlain(), 500))}`)}
          >
            <span className="share-mark share-glyph" aria-hidden>
              X
            </span>
            <span className="share-destination-label">Post on X</span>
            <span className="share-destination-hint">Open</span>
          </button>
          <button
            type="button"
            className="share-destination"
            onClick={() =>
              openShare(
                `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(clip(answerPlain(), 500))}`,
              )
            }
          >
            <span className="share-mark share-glyph" aria-hidden>
              in
            </span>
            <span className="share-destination-label">LinkedIn</span>
            <span className="share-destination-hint">Open</span>
          </button>
          <button
            type="button"
            className="share-destination"
            onClick={() =>
              openShare(
                `https://www.reddit.com/submit?title=${encodeURIComponent('Answer from Knowra')}&text=${encodeURIComponent(clip(answerPlain(), 500))}`,
              )
            }
          >
            <span className="share-mark share-glyph" aria-hidden>
              r
            </span>
            <span className="share-destination-label">Reddit</span>
            <span className="share-destination-hint">Open</span>
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-snug text-[var(--color-ink-muted)]">
          Only this answer is shared. Your files stay in Knowra.
        </p>
      </div>
    </div>
  );
}
