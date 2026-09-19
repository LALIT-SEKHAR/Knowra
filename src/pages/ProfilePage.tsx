import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  LoaderCircle,
  Save,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

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

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const displayAvatar = previewUrl || user?.avatarUrl || null;
  const initials = initialsFrom(name || user?.name, user?.email);

  function onPickFile(file: File | undefined) {
    setError('');
    setMessage('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPEG, PNG, WebP, or GIF).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Avatar must be 2MB or smaller.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.updateProfile({ name: name.trim() });
      if (selectedFile) {
        await api.uploadAvatar(selectedFile);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSelectedFile(null);
        setPreviewUrl(null);
      }
      await refreshUser();
      setMessage('Profile saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save profile');
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveAvatar() {
    setRemovingAvatar(true);
    setError('');
    setMessage('');
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedFile(null);
      setPreviewUrl(null);
      if (user?.avatarUrl) {
        await api.deleteAvatar();
        await refreshUser();
      }
      setMessage('Profile photo removed.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove photo');
    } finally {
      setRemovingAvatar(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="page-shell relative mx-auto max-w-2xl">
      <div
        className="ambient-orb right-[-8%] top-[10%] bg-white/10"
        aria-hidden
      />

      <div className="relative z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          Back to workspace
        </Link>

        <header className="mt-5">
          <h1 className="flex items-center gap-3 font-[family-name:var(--font-display)] text-3xl leading-none tracking-tight">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-[var(--color-line)] bg-white/[0.06]">
              <UserRound className="size-6 text-[var(--color-ink)]" strokeWidth={1.6} aria-hidden />
            </span>
            Profile
          </h1>
          <p className="mt-2.5 text-sm text-[var(--color-ink-muted)]" style={{ paddingLeft: 52 }}>
            Your name and photo appear across Knowra.
          </p>
        </header>

        <section className="glass mt-8 p-5 sm:p-6">
          <form className="space-y-6" onSubmit={onSave}>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <div className="relative">
                {displayAvatar ? (
                  <img
                    src={displayAvatar}
                    alt=""
                    className="size-24 rounded-full object-cover ring-1 ring-[var(--color-line)]"
                  />
                ) : (
                  <div
                    className="flex size-24 items-center justify-center rounded-full bg-white/[0.08] text-xl font-semibold tracking-wide text-[var(--color-ink)] ring-1 ring-[var(--color-line)]"
                    aria-hidden
                  >
                    {initials}
                  </div>
                )}
                <button
                  type="button"
                  className="absolute -right-1 -bottom-1 inline-flex size-9 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink)] shadow-sm transition-colors hover:bg-white/[0.08]"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Change profile photo"
                >
                  <Camera className="size-4" strokeWidth={1.75} aria-hidden />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--color-ink)]">Profile photo</p>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  JPEG, PNG, WebP, or GIF · max 2MB
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera className="icon-sm" aria-hidden />
                    {displayAvatar ? 'Change photo' : 'Upload photo'}
                  </button>
                  {(displayAvatar || selectedFile) && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={removingAvatar || busy}
                      onClick={() => void onRemoveAvatar()}
                    >
                      {removingAvatar ? (
                        <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="icon-sm" aria-hidden />
                      )}
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                onPickFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            <label className="block text-sm font-medium">
              Display name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={80}
                autoComplete="name"
                className="field mt-1.5"
              />
            </label>

            <label className="block text-sm font-medium">
              Email
              <input
                type="email"
                value={user?.email ?? ''}
                disabled
                className="field mt-1.5 opacity-70"
              />
              <span className="mt-1.5 block text-xs text-[var(--color-ink-muted)]">
                Email is tied to your sign-in and can’t be changed here.
              </span>
            </label>

            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={busy || removingAvatar} className="btn btn-primary">
                {busy ? (
                  <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                ) : (
                  <Save className="icon-sm" aria-hidden />
                )}
                {busy ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>

          {message && <p className="mt-3 text-sm text-[var(--color-accent)]">{message}</p>}
          {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
        </section>
      </div>
    </div>
  );
}
