import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  KeyRound,
  LoaderCircle,
  Save,
  Settings,
  Trash2,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { UserAvatar, displayName } from '../components/UserAvatar';

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.putOpenAIKey(apiKey.trim());
      setApiKey('');
      setMessage('API key saved securely.');
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save key');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.deleteOpenAIKey();
      setMessage('API key removed.');
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove key');
    } finally {
      setBusy(false);
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
              <Settings className="size-6 text-[var(--color-ink)]" strokeWidth={1.6} aria-hidden />
            </span>
            Settings
          </h1>
          <div className="mt-2.5 flex items-center gap-2.5" style={{ paddingLeft: 52 }}>
            <UserAvatar user={user} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm text-[var(--color-ink)]">{displayName(user)}</p>
              <p className="truncate text-xs text-[var(--color-ink-muted)]">
                <Link to="/profile" className="text-[var(--color-accent)] hover:underline">
                  Edit profile
                </Link>
                {' · '}
                {user?.email}
              </p>
            </div>
          </div>
        </header>

        <section className="glass mt-8 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
            <KeyRound className="icon-sm shrink-0 text-[var(--color-ink-muted)]" strokeWidth={1.75} aria-hidden />
            OpenAI API key
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            Knowra uses your key for embeddings (`text-embedding-3-small`) and chat (`gpt-4o-mini`).
            The key is encrypted at rest and never shown again in full.
          </p>

          <div className="surface-inset mt-5 px-4 py-4">
            <h3 className="text-sm font-semibold text-[var(--color-ink)]">How to get a key</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--color-ink-muted)]">
              <li>
                Create or sign in to an OpenAI account at{' '}
                <a
                  href="https://platform.openai.com/signup"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-accent)] underline"
                >
                  platform.openai.com
                </a>
                .
              </li>
              <li>
                Open{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-accent)] underline"
                >
                  API keys
                </a>{' '}
                and click <strong className="text-[var(--color-ink)]">Create new secret key</strong>.
              </li>
              <li>
                Copy the key (it starts with <code className="text-[var(--color-ink)]">sk-</code>). You
                won’t be able to see it again on OpenAI’s site.
              </li>
              <li>
                Paste it below and click <strong className="text-[var(--color-ink)]">Save key</strong>.
                Knowra validates it before saving.
              </li>
              <li>
                Make sure your OpenAI project has billing / credits enabled, or API calls will fail.
              </li>
            </ol>
            <p className="mt-3 text-xs text-[var(--color-ink-muted)]">
              Never share your key. Knowra stores it encrypted and only uses it for your own uploads
              and chats.
            </p>
          </div>

          {user?.hasOpenAIKey ? (
            <p className="mt-4 flex items-center gap-2 text-sm">
              <Check className="icon-sm shrink-0 text-[var(--color-accent)]" strokeWidth={2} aria-hidden />
              <span>
                Current key ending in <strong>••••{user.openaiKeyLast4}</strong>
              </span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-[var(--color-warn)]">
              No key configured. Upload and chat require a key.
            </p>
          )}

          <form className="mt-5 space-y-3" onSubmit={onSave}>
            <label className="block text-sm font-medium">
              Secret key
              <div className="relative mt-1.5">
                <KeyRound
                  className="pointer-events-none absolute top-1/2 left-3 size-[16px] -translate-y-1/2 text-[var(--color-ink-muted)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  autoComplete="off"
                  spellCheck={false}
                  className="field !pl-10"
                  required
                />
              </div>
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="submit" disabled={busy} className="btn btn-primary">
                {busy ? (
                  <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                ) : (
                  <Save className="icon-sm" aria-hidden />
                )}
                {busy ? 'Saving…' : 'Save key'}
              </button>
              {user?.hasOpenAIKey && (
                <button type="button" disabled={busy} onClick={onRemove} className="btn btn-secondary">
                  <Trash2 className="icon-sm" aria-hidden />
                  Remove key
                </button>
              )}
            </div>
          </form>

          {message && <p className="mt-3 text-sm text-[var(--color-accent)]">{message}</p>}
          {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
        </section>
      </div>
    </div>
  );
}
