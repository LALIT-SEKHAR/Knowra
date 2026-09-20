import clsx from 'clsx';

type BrandMarkProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  tagline?: boolean;
  stacked?: boolean;
};

const sizeMap = {
  sm: 'size-7',
  md: 'size-9',
  lg: 'size-11',
  xl: 'size-14',
} as const;

const wordMap = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl',
} as const;

export function BrandMark({
  className,
  size = 'md',
  showWordmark = true,
  tagline = false,
  stacked = false,
}: BrandMarkProps) {
  return (
    <div
      className={clsx(
        'inline-flex',
        stacked ? 'flex-col items-start gap-2' : 'items-center gap-2.5',
        className,
      )}
    >
      <img
        src="/logo.png"
        alt=""
        width={56}
        height={56}
        className={clsx(sizeMap[size], 'shrink-0 rounded-[22%] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.55)]')}
        aria-hidden={showWordmark}
      />
      {showWordmark ? (
        <div className={clsx(stacked && 'pl-0.5')}>
          <p
            className={clsx(
              'font-[family-name:var(--font-display)] leading-none tracking-tight text-[var(--color-ink)]',
              wordMap[size],
            )}
          >
            Knowra
          </p>
          {tagline ? (
            <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">Ask. Explore. Understand.</p>
          ) : null}
        </div>
      ) : (
        <span className="sr-only">Knowra</span>
      )}
    </div>
  );
}
