import clsx from 'clsx';
import type { FileActivityModel } from '../utils/fileActivity';

export function FileActivity({
  title,
  detail,
  progress,
  failed = false,
  compact = false,
}: FileActivityModel & { compact?: boolean }) {
  const pct = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)));
  const summary = [pct != null ? `${pct}%` : null, detail].filter(Boolean).join(' · ');

  return (
    <div className={clsx('file-activity', compact && 'file-activity-compact', failed && 'is-failed')}>
      <div className="file-activity-row">
        <span className="file-activity-title">{title}</span>
        {summary ? <span className="file-activity-detail">{summary}</span> : null}
      </div>
      {!failed ? (
        <div
          className={clsx('mat-progress', pct == null && 'is-indeterminate')}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={pct == null ? undefined : 100}
          aria-valuenow={pct ?? undefined}
          aria-label={summary ? `${title}. ${summary}` : title}
        >
          <span
            className="mat-progress-primary"
            style={pct != null ? { width: `${pct}%` } : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
