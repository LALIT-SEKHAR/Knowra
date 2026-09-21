import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  FileUp,
  Hash,
  IdCard,
  ImageIcon,
  Layers,
  LoaderCircle,
  Mail,
  MessageSquare,
  Save,
  ScanText,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { BrandMark } from '../components/BrandMark';
import { AvatarCropDialog } from '../components/AvatarCropDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  UsageActivityGraph,
  formatUsageNumber,
  totalTokens,
} from '../components/UsageActivityGraph';
import type { UsageSummary, UsageTotals } from '../types';
import clsx from 'clsx';

type ProfileSection = 'photo' | 'details' | 'usage';
type UsagePeriod = 'day' | 'week' | 'month';

const SECTIONS: {
  id: ProfileSection;
  label: string;
  icon: typeof ImageIcon;
}[] = [
  { id: 'photo', label: 'Photo', icon: ImageIcon },
  { id: 'details', label: 'Details', icon: IdCard },
  { id: 'usage', label: 'Usage', icon: Sparkles },
];

const PERIODS: { id: UsagePeriod; label: string }[] = [
  { id: 'day', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

function sectionFromHash(): ProfileSection {
  const hash = window.location.hash.replace(/^#/, '');
  if (SECTIONS.some((s) => s.id === hash)) return hash as ProfileSection;
  return 'photo';
}

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

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof FileUp;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="usage-metric">
      <div className="usage-metric-icon" aria-hidden>
        <Icon className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="usage-metric-value">{value}</p>
        <p className="usage-metric-label">{label}</p>
        <p className="usage-metric-hint">{hint}</p>
      </div>
    </div>
  );
}

function periodLabel(period: UsagePeriod): string {
  if (period === 'day') return 'today';
  if (period === 'week') return 'the last 7 days';
  return 'the last 30 days';
}

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [section, setSection] = useState<ProfileSection>(sectionFromHash);
  const [name, setName] = useState(user?.name ?? '');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [removeAvatarConfirmOpen, setRemoveAvatarConfirmOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [usagePeriod, setUsagePeriod] = useState<UsagePeriod>('week');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(user?.name ?? '');
  }, [user?.name]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  useEffect(() => {
    const onHash = () => setSection(sectionFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (section !== 'usage') return;
    let cancelled = false;
    setUsageLoading(true);
    setUsageError('');
    void api
      .getUsage()
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setUsageError(err instanceof ApiError ? err.message : 'Failed to load usage');
        }
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [section]);

  function goToSection(id: ProfileSection) {
    setSection(id);
    window.history.replaceState(null, '', `#${id}`);
    setMessage('');
    setError('');
  }

  const displayAvatar = previewUrl || user?.avatarUrl || null;
  const initials = initialsFrom(name || user?.name, user?.email);
  const activeMeta = SECTIONS.find((s) => s.id === section)!;
  const hasUnsavedPhoto = Boolean(selectedFile);
  const periodTotals: UsageTotals | null = usage?.periods[usagePeriod] ?? null;

  function onPickFile(file: File | undefined) {
    setError('');
    setMessage('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPEG, PNG, WebP, or GIF).');
      return;
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
  }

  function onCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  function onCropApply(file: File) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
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
        setMessage('Profile details and photo saved.');
      } else {
        setMessage('Profile details saved.');
      }
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save profile');
    } finally {
      setBusy(false);
    }
  }

  async function onSavePhoto() {
    if (!selectedFile) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.uploadAvatar(selectedFile);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSelectedFile(null);
      setPreviewUrl(null);
      await refreshUser();
      setMessage('Profile photo updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update photo');
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
      setRemoveAvatarConfirmOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove photo');
    } finally {
      setRemovingAvatar(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="page-shell relative mx-auto max-w-4xl">
      <div className="ambient-orb right-[-8%] top-[10%] bg-white/10" aria-hidden />

      <div className="relative z-10 pb-10">
        <Link
          to="/"
          className="btn btn-ghost !px-0 text-sm text-[var(--color-ink-muted)]"
        >
          <ArrowLeft className="icon" aria-hidden />
          Back to workspace
        </Link>

        <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-3xl tracking-tight">
              <BrandMark size="sm" showWordmark={false} />
              Profile
            </h1>
            <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
              Your name, photo, and AI usage across Knowra.
            </p>
          </div>

          <Link
            to="/settings"
            className="group inline-flex items-center gap-2.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white/[0.04] py-2 pr-2.5 pl-2.5 transition-colors hover:bg-white/[0.07]"
          >
            <Settings
              className="size-4 shrink-0 text-[var(--color-ink-muted)]"
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm leading-tight text-[var(--color-ink)]">Settings</p>
              <p className="text-[11px] text-[var(--color-ink-muted)]">API key & account</p>
            </div>
            <ChevronRight
              className="size-4 shrink-0 text-[var(--color-ink-muted)] transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
              aria-hidden
            />
          </Link>
        </header>

        {(message || error) && (
          <div
            className={clsx('settings-flash mt-5', error && 'settings-flash-error')}
            role="status"
          >
            {error || message}
          </div>
        )}

        <div className="glass settings-layout mt-6 overflow-hidden">
          <nav className="settings-nav" aria-label="Profile sections">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={clsx(
                  'settings-nav-btn',
                  section === id && 'settings-nav-btn-active',
                )}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => goToSection(id)}
              >
                <Icon className="icon-sm shrink-0" strokeWidth={1.75} aria-hidden />
                {label}
              </button>
            ))}
          </nav>

          <div className="settings-panel" role="tabpanel" aria-label={activeMeta.label}>
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

            {section === 'photo' && (
              <section>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="settings-section-title">Profile photo</h2>
                    <p className="settings-section-desc max-w-md">
                      Shown in the sidebar, chats, and account menus. Crop to a square after pick —
                      large images are compressed automatically. JPEG, PNG, WebP, or GIF.
                    </p>
                  </div>
                  {hasUnsavedPhoto ? (
                    <span className="settings-status settings-status-warn">Unsaved change</span>
                  ) : displayAvatar ? (
                    <span className="settings-status settings-status-ok">Photo set</span>
                  ) : (
                    <span className="settings-status">Using initials</span>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="relative shrink-0">
                    {displayAvatar ? (
                      <img
                        src={displayAvatar}
                        alt=""
                        className="size-28 rounded-full object-cover ring-1 ring-[var(--color-line)]"
                      />
                    ) : (
                      <div
                        className="flex size-28 items-center justify-center rounded-full bg-white/[0.08] text-2xl font-semibold tracking-wide text-[var(--color-ink)] ring-1 ring-[var(--color-line)]"
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
                    <div className="flex flex-wrap gap-2">
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
                          className="btn btn-danger-soft"
                          disabled={removingAvatar || busy}
                          onClick={() => setRemoveAvatarConfirmOpen(true)}
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
                    {hasUnsavedPhoto ? (
                      <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
                        New photo selected. Save to upload it to your account.
                      </p>
                    ) : null}
                  </div>
                </div>

                {hasUnsavedPhoto ? (
                  <div className="mt-6 border-t border-[var(--color-line)] pt-5">
                    <button
                      type="button"
                      disabled={busy || removingAvatar}
                      className="btn btn-primary"
                      onClick={() => void onSavePhoto()}
                    >
                      {busy ? (
                        <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                      ) : (
                        <Save className="icon-sm" aria-hidden />
                      )}
                      {busy ? 'Saving…' : 'Save photo'}
                    </button>
                  </div>
                ) : null}
              </section>
            )}

            {section === 'details' && (
              <section>
                <h2 className="settings-section-title">Personal details</h2>
                <p className="settings-section-desc">
                  Your display name is shown next to your photo across Knowra.
                </p>

                <form className="mt-6" onSubmit={onSave}>
                  <div className="settings-row !border-t-0 !pt-0 !items-start">
                    <div className="settings-row-label sm:pt-2.5">
                      <p>Display name</p>
                      <p>Up to 80 characters. Leave blank to use your email prefix.</p>
                    </div>
                    <div className="settings-row-action w-full sm:max-w-sm">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        maxLength={80}
                        autoComplete="name"
                        className="field"
                      />
                    </div>
                  </div>

                  <div className="settings-row !items-start">
                    <div className="settings-row-label sm:pt-2.5">
                      <p>Email</p>
                      <p>Tied to your sign-in and can’t be changed here.</p>
                    </div>
                    <div className="settings-row-action w-full sm:max-w-sm">
                      <div className="relative">
                        <Mail
                          className="pointer-events-none absolute top-1/2 left-3 size-[16px] -translate-y-1/2 text-[var(--color-ink-muted)]"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <input
                          type="email"
                          value={user?.email ?? ''}
                          disabled
                          className="field !pl-10 opacity-70"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--color-line)] pt-5">
                    <button
                      type="submit"
                      disabled={busy || removingAvatar}
                      className="btn btn-primary"
                    >
                      {busy ? (
                        <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                      ) : (
                        <Save className="icon-sm" aria-hidden />
                      )}
                      {busy ? 'Saving…' : 'Save details'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {section === 'usage' && (
              <section>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="settings-section-title">AI usage</h2>
                    <p className="settings-section-desc max-w-lg">
                      Knowra runs on your API keys. These counters show how the app used them —
                      uploads, OCR, embeddings, tokenization, and chat — so you can estimate cost.
                    </p>
                  </div>
                  <div className="usage-period-tabs" role="tablist" aria-label="Usage period">
                    {PERIODS.map(({ id, label }) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={usagePeriod === id}
                        className={clsx(
                          'usage-period-tab',
                          usagePeriod === id && 'usage-period-tab-active',
                        )}
                        onClick={() => setUsagePeriod(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {usageLoading ? (
                  <div className="mt-8 flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
                    <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                    Loading usage…
                  </div>
                ) : usageError ? (
                  <div className="settings-flash settings-flash-error mt-6" role="alert">
                    {usageError}
                  </div>
                ) : periodTotals && usage ? (
                  <>
                    <div className="usage-metric-grid mt-6">
                      <MetricCard
                        icon={FileUp}
                        label="Uploads"
                        value={formatUsageNumber(periodTotals.uploads)}
                        hint={`Files added ${periodLabel(usagePeriod)}`}
                      />
                      <MetricCard
                        icon={ScanText}
                        label="OCR pages"
                        value={formatUsageNumber(periodTotals.ocrPages)}
                        hint={`${formatUsageNumber(periodTotals.ocrTokens)} vision tokens`}
                      />
                      <MetricCard
                        icon={Layers}
                        label="Embeddings"
                        value={formatUsageNumber(periodTotals.embeddings)}
                        hint={`${formatUsageNumber(periodTotals.embeddingTokens)} embedding tokens`}
                      />
                      <MetricCard
                        icon={Hash}
                        label="Chunks"
                        value={formatUsageNumber(periodTotals.chunks)}
                        hint="Text chunks after tokenization"
                      />
                      <MetricCard
                        icon={MessageSquare}
                        label="Chat turns"
                        value={formatUsageNumber(periodTotals.chats)}
                        hint={`${formatUsageNumber(periodTotals.chatTokens)} chat tokens`}
                      />
                      <MetricCard
                        icon={Sparkles}
                        label="AI calls"
                        value={formatUsageNumber(periodTotals.aiCalls)}
                        hint={`${formatUsageNumber(totalTokens(periodTotals))} total tokens`}
                      />
                    </div>

                    <div className="mt-8 border-t border-[var(--color-line)] pt-6">
                      <h3 className="text-sm font-medium text-[var(--color-ink)]">
                        Activity over the last year
                      </h3>
                      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                        Daily intensity from uploads, OCR, embeddings, and chat — like a commit graph.
                      </p>
                      <UsageActivityGraph days={usage.daily} className="mt-4" />
                    </div>

                    <div className="settings-why mt-6">
                      <p className="settings-why-title">What these mean</p>
                      <ul className="settings-why-list">
                        <li>
                          <strong>OCR</strong> — scanned PDF pages read with your OpenAI vision model.
                        </li>
                        <li>
                          <strong>Embeddings / chunks</strong> — document text split and indexed for
                          retrieval (OpenAI embeddings).
                        </li>
                        <li>
                          <strong>Chat tokens</strong> — billed to your selected chat provider key.
                        </li>
                      </ul>
                      <p className="settings-why-note">
                        Year total: {formatUsageNumber(usage.totals.aiCalls)} AI calls ·{' '}
                        {formatUsageNumber(totalTokens(usage.totals))} tokens across all features.
                      </p>
                    </div>
                  </>
                ) : null}
              </section>
            )}
          </div>
        </div>
      </div>

      <AvatarCropDialog
        key={cropSrc ?? 'closed'}
        open={Boolean(cropSrc)}
        imageSrc={cropSrc}
        busy={busy || removingAvatar}
        onCancel={onCropCancel}
        onApply={onCropApply}
      />

      <ConfirmDialog
        open={removeAvatarConfirmOpen}
        title="Remove photo?"
        description="Your profile will show initials instead of a photo until you upload a new one."
        confirmLabel="Remove photo"
        danger
        busy={removingAvatar}
        onCancel={() => {
          if (!removingAvatar) setRemoveAvatarConfirmOpen(false);
        }}
        onConfirm={() => {
          void onRemoveAvatar();
        }}
      />
    </div>
  );
}
