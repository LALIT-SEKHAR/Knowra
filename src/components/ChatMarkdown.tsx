import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import { repairDisplayMath } from '../utils/markdownMath';

type Props = {
  content: string;
  /** Reveal a freshly received reply instead of painting it all at once. */
  animate?: boolean;
  onComplete?: () => void;
  onTick?: () => void;
};

const TICK_MS = 24;

function charsPerTick(length: number) {
  const ticksForCap = 7000 / TICK_MS;
  if (length <= ticksForCap) return 1;
  return Math.max(1, Math.ceil(length / ticksForCap));
}

function nextIndex(text: string, index: number, step: number) {
  let next = Math.min(text.length, index + step);
  if (next >= text.length || next === 0) return next;
  const prev = text.charCodeAt(next - 1);
  if (prev >= 0xd800 && prev <= 0xdbff) next += 1;
  if (step > 1) {
    while (next < text.length && !/\s/.test(text[next])) next += 1;
  }
  return Math.min(text.length, next);
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type MathRange = { start: number; end: number };

function isLineStart(text: string, index: number) {
  let cursor = index;
  while (cursor > 0 && text[cursor - 1] !== '\n') cursor -= 1;
  const indent = text.slice(cursor, index);
  return indent.length <= 3 && /^ *$/.test(indent);
}

/** Finished `$...$` and `$$...$$` spans. Incomplete formulas are omitted on purpose. */
function mathRanges(text: string): MathRange[] {
  const ranges: MathRange[] = [];
  let index = 0;
  let inFence = false;

  while (index < text.length) {
    if (isLineStart(text, index) && text.startsWith('```', index)) {
      inFence = !inFence;
      const nextLine = text.indexOf('\n', index);
      index = nextLine === -1 ? text.length : nextLine + 1;
      continue;
    }
    if (inFence) {
      index += 1;
      continue;
    }
    if (text[index] === '`') {
      const close = text.indexOf('`', index + 1);
      const newline = text.indexOf('\n', index + 1);
      if (close !== -1 && (newline === -1 || close < newline)) {
        index = close + 1;
        continue;
      }
    }
    if (text[index] === '\\' && text[index + 1] === '$') {
      index += 2;
      continue;
    }
    if (text[index] !== '$') {
      index += 1;
      continue;
    }

    let size = 0;
    while (text[index + size] === '$') size += 1;

    if (size >= 2 && isLineStart(text, index)) {
      const lineEnd = text.indexOf('\n', index + size);
      const restOfLine = lineEnd === -1 ? text.slice(index + size) : text.slice(index + size, lineEnd);
      if (lineEnd !== -1 && !restOfLine.includes('$')) {
        const close = closingDisplayFence(text, lineEnd + 1, size);
        if (close !== -1) {
          ranges.push({ start: index, end: close });
          index = close;
          continue;
        }
      }
    }

    const close = closingMathText(text, index + size, size);
    if (close !== -1) {
      ranges.push({ start: index, end: close });
      index = close;
      continue;
    }

    index += size;
  }

  return ranges;
}

function closingDisplayFence(text: string, from: number, size: number) {
  let line = from;
  while (line < text.length) {
    let cursor = line;
    let indent = 0;
    while (cursor < text.length && text[cursor] === ' ' && indent < 3) {
      cursor += 1;
      indent += 1;
    }
    let dollars = 0;
    while (text[cursor + dollars] === '$') dollars += 1;
    if (dollars >= size) {
      let after = cursor + dollars;
      while (after < text.length && (text[after] === ' ' || text[after] === '\t')) after += 1;
      if (after === text.length || text[after] === '\n') return after === text.length ? after : after + 1;
    }
    const nextLine = text.indexOf('\n', line);
    if (nextLine === -1) return -1;
    line = nextLine + 1;
  }
  return -1;
}

function closingMathText(text: string, from: number, size: number) {
  let index = from;
  while (index < text.length) {
    if (text[index] !== '$') {
      index += 1;
      continue;
    }
    let dollars = 0;
    while (text[index + dollars] === '$') dollars += 1;
    if (dollars === size) return index + dollars;
    index += dollars;
  }
  return -1;
}

/** Keep a half-typed formula out of KaTeX until its closing delimiter arrives. */
function endOutsideMath(text: string, index: number, ranges: MathRange[]) {
  for (const range of ranges) {
    if (index > range.start && index < range.end) return range.start;
  }
  return index;
}

/** Close markers that are still being typed so `**bold` doesn't flash raw asterisks. */
function closePartialMarkdown(slice: string) {
  let out = slice;
  const fences = out.split('```').length - 1;
  if (fences % 2 === 1) out += '\n```';

  if ((out.split('**').length - 1) % 2 === 1) out += '**';
  if ((out.split('~~').length - 1) % 2 === 1) out += '~~';
  if ((out.split('__').length - 1) % 2 === 1) out += '__';

  const italics = out.replaceAll('**', '').replaceAll('__', '').split('*').length - 1;
  if (italics % 2 === 1) out += '*';

  const inlineCode = out.replaceAll('```', '').split('`').length - 1;
  if (inlineCode % 2 === 1) out += '`';

  return out;
}

export function ChatMarkdown({ content, animate = false, onComplete, onTick }: Props) {
  const normalized = useMemo(() => repairDisplayMath(content), [content]);
  const [typedCount, setTypedCount] = useState(0);
  const [trackedContent, setTrackedContent] = useState(normalized);
  const onCompleteRef = useRef(onComplete);
  const onTickRef = useRef(onTick);

  if (trackedContent !== normalized) {
    setTrackedContent(normalized);
    setTypedCount(0);
  }

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onTickRef.current = onTick;
  });

  useEffect(() => {
    if (!animate || prefersReducedMotion() || normalized.length === 0) {
      if (animate) onCompleteRef.current?.();
      return;
    }

    let index = 0;
    let cancelled = false;
    const step = charsPerTick(normalized.length);

    const id = window.setInterval(() => {
      index = nextIndex(normalized, index, step);
      setTypedCount(index);
      onTickRef.current?.();
      if (index >= normalized.length) {
        window.clearInterval(id);
        if (!cancelled) onCompleteRef.current?.();
      }
    }, TICK_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [animate, normalized]);

  const reduceMotion = prefersReducedMotion();
  const typing = animate && !reduceMotion && typedCount < normalized.length;
  const ranges = useMemo(() => (typing ? mathRanges(normalized) : []), [normalized, typing]);
  const shown = typing
    ? closePartialMarkdown(normalized.slice(0, endOutsideMath(normalized, typedCount, ranges)))
    : normalized;

  return (
    <>
      {typing ? <span className="sr-only">{normalized}</span> : null}
      <div className={typing ? 'chat-md is-typing' : 'chat-md'} aria-hidden={typing || undefined}>
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[[rehypeKatex, { strict: 'ignore', errorColor: '#f87171' }]]}
          components={{
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
            li: ({ children }) => <li>{children}</li>,
          }}
        >
          {shown}
        </ReactMarkdown>
      </div>
    </>
  );
}
