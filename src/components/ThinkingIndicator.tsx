import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ChatMessage } from '../types';
import { formatMessageTime, type TimeFormat } from '../utils/format';
import { ChatMarkdown } from './ChatMarkdown';
import { KnowraMark } from './KnowraMark';

const PHASES = [
  'Searching your files',
  'Reading the passages',
  'Connecting the details',
  'Drafting an answer',
] as const;

const ORBITS = [
  { tilt: 0, duration: '4.6s', direction: 'normal' as const },
  { tilt: 62, duration: '7.4s', direction: 'reverse' as const },
  { tilt: -58, duration: '5.8s', direction: 'normal' as const },
];

const BARS = 14;

type LiveReplyProps = {
  message: ChatMessage | null;
  timeFormat: TimeFormat;
  onTick: () => void;
  onTypingComplete: () => void;
};

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function LiveReply({ message, timeFormat, onTick, onTypingComplete }: LiveReplyProps) {
  const [phase, setPhase] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const chipWidth = useRef(0);
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    if (message || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setPhase((current) => (current + 1) % PHASES.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [message]);

  useEffect(() => {
    if (!message || prefersReducedMotion()) return;
    const id = window.setInterval(() => onTickRef.current(), 48);
    const stop = window.setTimeout(() => window.clearInterval(id), 1100);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [message]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    if (!message) {
      shell.style.width = '';
      shell.style.transition = '';
      chipWidth.current = shell.offsetWidth;
      shell.style.setProperty('--think-h', `${shell.offsetHeight}px`);
      return;
    }

    if (prefersReducedMotion()) return;

    const probe = probeRef.current;
    const parent = shell.parentElement;
    if (!probe || !parent) return;

    probe.style.maxWidth = `${Math.max(0, parent.clientWidth * 0.7)}px`;
    const start = chipWidth.current || shell.offsetWidth;
    const measured = probe.getBoundingClientRect().width;
    const end = measured > 48 ? measured : start;
    shell.style.transition = 'none';
    shell.style.width = `${start}px`;
    void shell.offsetWidth;
    shell.style.transition = 'width 880ms cubic-bezier(0.22, 1, 0.36, 1)';
    shell.style.width = `${end}px`;
  }, [message]);

  const timeLabel = message ? formatMessageTime(message.createdAt, timeFormat) : '';

  return (
    <div
      ref={shellRef}
      className={clsx('think', message && 'think-unfold text-left text-sm leading-relaxed')}
      role={message ? undefined : 'status'}
      aria-live={message ? undefined : 'polite'}
      aria-busy={message ? undefined : true}
    >
      {message ? null : <span className="sr-only">Knowra is thinking</span>}
      <div className="think-live" aria-hidden>
        <div className="think-stage">
          <span className="think-sweep" />
          <span className="think-sonar" />
          <span className="think-sonar think-sonar-late" />
          <svg className="think-svg" viewBox="0 0 80 80">
            <defs>
              <filter id="think-bead" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="0.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {ORBITS.map((orbit) => (
              <g
                key={orbit.tilt}
                className="think-orbit"
                style={{
                  animationDuration: orbit.duration,
                  animationDirection: orbit.direction,
                }}
              >
                <ellipse
                  cx="40"
                  cy="40"
                  rx="29"
                  ry="11"
                  fill="none"
                  transform={`rotate(${orbit.tilt} 40 40)`}
                />
                <g transform={`rotate(${orbit.tilt} 40 40)`} filter="url(#think-bead)">
                  <circle cx="69" cy="40" r="1.9" />
                  <circle cx="11" cy="40" r="1.15" opacity="0.72" />
                </g>
              </g>
            ))}
          </svg>
          <span className="think-core">
            <KnowraMark />
            <span className="think-scan" />
          </span>
        </div>
        <div className="think-copy">
          <p className="think-kicker">
            Knowra
            <span className="think-pips">
              <i />
              <i />
              <i />
            </span>
          </p>
          <p className="think-phase" key={phase}>
            {PHASES[phase]}
          </p>
          <div className="think-eq">
            {Array.from({ length: BARS }, (_, index) => (
              <span key={index} style={{ ['--i' as string]: index }} />
            ))}
          </div>
        </div>
      </div>
      {message ? (
        <>
          <span className="think-flash" aria-hidden />
          <div className="think-answer">
            <div className="think-answer-inner">
              <div className="bubble-meta">
                <span className="inline-flex items-center gap-1.5">
                  <KnowraMark className="size-3.5 rounded-[4px]" />
                  Knowra
                </span>
                {timeLabel ? (
                  <time dateTime={message.createdAt} className="shrink-0 tabular-nums">
                    {timeLabel}
                  </time>
                ) : null}
              </div>
              <ChatMarkdown
                content={message.content}
                animate
                onTick={onTick}
                onComplete={onTypingComplete}
              />
            </div>
          </div>
          <div
            ref={probeRef}
            className="bubble-ai think-probe px-4 py-3 text-sm leading-relaxed"
            inert
            aria-hidden
          >
            <div className="bubble-meta">
              <span className="inline-flex items-center gap-1.5">
                <KnowraMark className="size-3.5 rounded-[4px]" />
                Knowra
              </span>
              {timeLabel ? <time className="shrink-0 tabular-nums">{timeLabel}</time> : null}
            </div>
            <ChatMarkdown content={message.content} />
          </div>
        </>
      ) : null}
    </div>
  );
}
