import clsx from 'clsx';
import type { User } from '../types';

function initialsFrom(name: string | null | undefined, email: string | undefined): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

type UserAvatarProps = {
  user: Pick<User, 'name' | 'email' | 'avatarUrl'> | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClass = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-24 text-xl',
} as const;

export function UserAvatar({ user, size = 'sm', className }: UserAvatarProps) {
  const initials = initialsFrom(user?.name, user?.email);

  if (user?.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        className={clsx(
          'shrink-0 rounded-full object-cover ring-1 ring-[var(--color-line)]',
          sizeClass[size],
          className,
        )}
      />
    );
  }

  return (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full bg-white/[0.08] font-semibold tracking-wide text-[var(--color-ink)] ring-1 ring-[var(--color-line)]',
        sizeClass[size],
        className,
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function displayName(user: Pick<User, 'name' | 'email'> | null | undefined): string {
  const name = user?.name?.trim();
  if (name) return name;
  return user?.email ?? 'Account';
}
