import clsx from 'clsx';

const SPARK =
  'M32 11.6 33.7 17.15 39.2 18.85 33.7 20.55 32 26.1 30.3 20.55 24.8 18.85 30.3 17.15Z';

const LEFT_PAGE =
  'M14.2 26.8c3.3-.6 6-.4 7.2 0 4.8 1.4 8.4 3.8 9.4 6.4v13.4c0 1.8-1.2 3-2.6 2.8-5-1.6-10.4-3.2-14-5Z';

const RIGHT_PAGE =
  'M49.8 26.8c-3.3-.6-6-.4-7.2 0-4.8 1.4-8.4 3.8-9.4 6.4v13.4c0 1.8 1.2 3 2.6 2.8 5-1.6 10.4-3.2 14-5Z';

type KnowraMarkProps = {
  className?: string;
};

export function KnowraMark({ className }: KnowraMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={clsx('knowra-mark', className)}
      aria-hidden
    >
      <rect className="knowra-mark-tile" width="64" height="64" />
      <path className="knowra-mark-spark" d={SPARK} />
      <path className="knowra-mark-page" d={LEFT_PAGE} />
      <path className="knowra-mark-page" d={RIGHT_PAGE} />
    </svg>
  );
}
