import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes } from 'react';

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ className, style, ...props }: SkeletonProps) {
  return <div className={clsx('skeleton', className)} style={style} {...props} aria-hidden />;
}

export function AppBootSkeleton() {
  return (
    <div className="flex h-full flex-col" role="status" aria-label="Loading">
      <div className="ambient-orb left-[-8%] top-[-10%] bg-white/15" aria-hidden />
      <div
        className="ambient-orb bottom-[-15%] right-[-5%] bg-white/8"
        style={{ animationDelay: '-6s' }}
        aria-hidden
      />
      <div className="relative z-10 flex min-h-0 flex-1 gap-3 p-3 lg:gap-4 lg:p-4">
        <aside className="glass hidden h-full w-[17.5rem] shrink-0 flex-col overflow-hidden lg:flex">
          <div className="border-b border-[var(--color-line)] px-4 py-4">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-36" />
          </div>
          <div className="flex-1 space-y-2 px-3 py-3">
            <Skeleton className="mb-2 h-3 w-12" />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-[var(--radius-control)]" />
            ))}
            <Skeleton className="mt-4 mb-2 h-3 w-10" />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={`f-${i}`} className="h-9 w-full rounded-[var(--radius-control)]" />
            ))}
          </div>
          <div className="border-t border-[var(--color-line)] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-8 shrink-0 !rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </div>
        </aside>
        <section className="surface flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="chrome-bar border-b border-[var(--color-line)] px-4 py-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-2 h-3 w-56" />
          </div>
          <div className="flex-1 space-y-4 px-4 py-4">
            <Skeleton className="h-3 w-64 max-w-full" />
            <div className="flex justify-end">
              <Skeleton className="h-16 w-[min(90%,18rem)] rounded-[var(--radius-control)]" />
            </div>
            <Skeleton className="h-24 w-[min(94%,28rem)] rounded-[var(--radius-control)]" />
            <div className="flex justify-end">
              <Skeleton className="h-12 w-[min(70%,14rem)] rounded-[var(--radius-control)]" />
            </div>
          </div>
          <div className="chrome-bar border-t border-[var(--color-line)] p-3">
            <Skeleton className="h-11 w-full rounded-[var(--radius-pill)]" />
          </div>
        </section>
      </div>
    </div>
  );
}

export function FilesTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-t border-[var(--color-line)]">
          <td className="px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 shrink-0" />
              <Skeleton className="h-4 w-40 max-w-[12rem]" />
            </div>
          </td>
          <td className="px-4 py-3.5">
            <Skeleton className="h-4 w-10" />
          </td>
          <td className="px-4 py-3.5">
            <Skeleton className="h-4 w-14" />
          </td>
          <td className="px-4 py-3.5">
            <Skeleton className="h-4 w-20" />
          </td>
          <td className="px-4 py-3.5">
            <Skeleton className="h-4 w-16" />
          </td>
          <td className="px-4 py-3.5">
            <Skeleton className="size-8 !rounded-full" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function FilesListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="size-4 shrink-0" />
                <Skeleton className="h-4 w-44 max-w-[70%]" />
              </div>
              <Skeleton className="h-3 w-36" />
            </div>
            <Skeleton className="size-8 shrink-0 !rounded-full" />
          </div>
        </li>
      ))}
    </>
  );
}

export function WorkspaceNavSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: items }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-[var(--radius-control)]" />
      ))}
    </div>
  );
}

export function ChatMessagesSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading conversation">
      <div className="flex justify-end">
        <Skeleton className="h-14 w-[min(90%,18rem)] rounded-[var(--radius-control)]" />
      </div>
      <Skeleton className="h-28 w-[min(94%,28rem)] rounded-[var(--radius-control)]" />
      <div className="flex justify-end">
        <Skeleton className="h-10 w-[min(70%,14rem)] rounded-[var(--radius-control)]" />
      </div>
      <Skeleton className="h-20 w-[min(88%,24rem)] rounded-[var(--radius-control)]" />
    </div>
  );
}

export function PdfStageSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3"
      role="status"
      aria-label="Loading PDF"
    >
      <Skeleton
        className="w-full rounded-[var(--radius-control)]"
        style={{ height: 'min(70vh, 42rem)', maxWidth: '100%' }}
      />
      <Skeleton
        className="w-full rounded-[var(--radius-control)] opacity-60"
        style={{ height: 'min(40vh, 24rem)', maxWidth: '100%' }}
      />
    </div>
  );
}

export function PdfPageSkeleton({ width, height }: { width: number; height: number }) {
  return <Skeleton className="skeleton-light !rounded-none" style={{ width, height }} />;
}
