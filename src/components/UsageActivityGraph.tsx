import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import clsx from 'clsx';
import type { UsageDay, UsageTotals } from '../types';

const WEEKDAYS = ['', 'Mon', '', 'Wed', '', 'Fri', ''] as const;
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function utcWeekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

function buildWeeks(days: UsageDay[]): UsageDay[][] {
  if (days.length === 0) return [];
  const weeks: UsageDay[][] = [];
  let week: UsageDay[] = [];

  // Pad leading empty cells so columns start on Sunday (GitHub-style).
  const firstDow = utcWeekday(days[0]!.date);
  for (let i = 0; i < firstDow; i += 1) {
    week.push({
      date: '',
      level: 0,
      score: 0,
      uploads: 0,
      ocrPages: 0,
      ocrTokens: 0,
      embeddings: 0,
      embeddingTokens: 0,
      chunks: 0,
      chats: 0,
      chatTokens: 0,
      aiCalls: 0,
    });
  }

  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) {
      week.push({
        date: '',
        level: 0,
        score: 0,
        uploads: 0,
        ocrPages: 0,
        ocrTokens: 0,
        embeddings: 0,
        embeddingTokens: 0,
        chunks: 0,
        chats: 0,
        chatTokens: 0,
        aiCalls: 0,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

function monthLabelsForWeeks(weeks: UsageDay[][]): Array<{ weekIndex: number; label: string }> {
  const labels: Array<{ weekIndex: number; label: string }> = [];
  let lastMonth = -1;
  let lastLabelWeek = -99;
  weeks.forEach((week, weekIndex) => {
    const firstReal = week.find((d) => d.date);
    if (!firstReal) return;
    const month = new Date(`${firstReal.date}T12:00:00.000Z`).getUTCMonth();
    if (month === lastMonth) return;
    lastMonth = month;
    // Narrow columns overlap if two month names start within a few weeks.
    if (weekIndex - lastLabelWeek < 3) return;
    labels.push({ weekIndex, label: MONTH_LABELS[month]! });
    lastLabelWeek = weekIndex;
  });
  return labels;
}

type Props = {
  days: UsageDay[];
  className?: string;
};

export function UsageActivityGraph({ days, className }: Props) {
  const [hover, setHover] = useState<UsageDay | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToToday = useRef(true);
  const weeks = useMemo(() => buildWeeks(days), [days]);
  const monthLabels = useMemo(() => monthLabelsForWeeks(weeks), [weeks]);
  const activeDays = days.filter((d) => d.score > 0).length;
  const todayKey = days.length > 0 ? days[days.length - 1]!.date : '';

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || weeks.length === 0) return;
    stickToToday.current = true;

    const pinToToday = () => {
      if (!stickToToday.current) return;
      el.scrollLeft = el.scrollWidth;
    };

    pinToToday();
    const frame = requestAnimationFrame(pinToToday);

    const onScroll = () => {
      const max = el.scrollWidth - el.clientWidth;
      stickToToday.current = max <= 1 || max - el.scrollLeft < 2;
    };

    const observer = new ResizeObserver(() => {
      pinToToday();
    });
    observer.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, [weeks.length]);

  return (
    <div
      className={clsx('usage-graph', className)}
      style={{ '--week-count': weeks.length } as CSSProperties}
    >
      <div className="usage-graph-frame">
        <div className="usage-graph-axis" aria-hidden>
          <span className="usage-graph-axis-spacer" />
          <div className="usage-graph-weekdays">
            {WEEKDAYS.map((label, row) => (
              <span key={`wd-${row}`} className="usage-graph-weekday">
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="usage-graph-scroll" ref={scrollRef}>
          <div className="usage-graph-months" aria-hidden>
            {monthLabels.map(({ weekIndex, label }) => (
              <span
                key={`${label}-${weekIndex}`}
                className="usage-graph-month"
                style={{ gridColumn: weekIndex + 1 }}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="usage-graph-grid">
            {weeks.map((week, weekIndex) =>
              week.map((day, dayIndex) => {
                const empty = !day.date;
                const isToday = !empty && day.date === todayKey;
                return (
                  <button
                    key={`${weekIndex}-${dayIndex}`}
                    type="button"
                    disabled={empty}
                    className={clsx(
                      'usage-graph-cell',
                      !empty && `usage-graph-level-${day.level}`,
                      empty && 'usage-graph-cell-empty',
                      isToday && 'usage-graph-cell-today',
                    )}
                    style={{ gridRow: dayIndex + 1, gridColumn: weekIndex + 1 }}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={
                      empty
                        ? undefined
                        : `${formatDayLabel(day.date)}: ${day.score} activity, ${day.chats} chats, ${day.uploads} uploads`
                    }
                    onMouseEnter={() => {
                      if (!empty) setHover(day);
                    }}
                    onFocus={() => {
                      if (!empty) setHover(day);
                    }}
                    onMouseLeave={() => setHover(null)}
                    onBlur={() => setHover(null)}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>

      <div className="usage-graph-footer">
        <p className="usage-graph-hint">
          {hover ? (
            <>
              <span className="text-[var(--color-ink)]">{formatDayLabel(hover.date)}</span>
              {' · '}
              {hover.chats} chats, {hover.uploads} uploads, {formatCompact(hover.chatTokens + hover.embeddingTokens + hover.ocrTokens)} tokens
            </>
          ) : (
            <>{activeDays} active day{activeDays === 1 ? '' : 's'} in the last year</>
          )}
        </p>
        <div className="usage-graph-legend" aria-hidden>
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={clsx('usage-graph-cell', `usage-graph-level-${level}`)} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

export function formatUsageNumber(n: number): string {
  return formatCompact(n);
}

export function totalTokens(t: UsageTotals): number {
  return t.chatTokens + t.embeddingTokens + t.ocrTokens;
}
