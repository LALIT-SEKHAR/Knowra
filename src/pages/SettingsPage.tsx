import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to="/" className="text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
        ← Back to workspace
      </Link>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl">Settings</h1>
      <p className="mt-2 text-[var(--color-ink-muted)]">
        Signed in as {user?.email}
      </p>

      <section className="mt-8 border border-[var(--color-line)] bg-[var(--color-panel)] p-6">
        <h2 className="text-lg font-semibold">OpenAI API key</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Knowra uses your key for embeddings (`text-embedding-3-small`) and chat (`gpt-4o-mini`).
          The key is encrypted at rest and never shown again in full.
        </p>

        <div className="mt-5 rounded-lg border border-[var(--color-line)] bg-white/70 px-4 py-4">
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
          <p className="mt-4 text-sm">
            Current key ending in <strong>••••{user.openaiKeyLast4}</strong>
          </p>
        ) : (
          <p className="mt-4 text-sm text-[var(--color-warn)]">
            No key configured. Upload and chat require a key.
          </p>
        )}

        <form className="mt-4 space-y-3" onSubmit={onSave}>
          <label className="block text-sm font-medium">
            Secret key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full border border-[var(--color-line)] bg-white px-3 py-2 outline-none focus:border-[var(--color-accent)]"
              required
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-[var(--color-accent)] px-4 py-2 text-white disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Save key'}
            </button>
            {user?.hasOpenAIKey && (
              <button
                type="button"
                disabled={busy}
                onClick={onRemove}
                className="border border-[var(--color-line)] px-4 py-2 disabled:opacity-60"
              >
                Remove key
              </button>
            )}
          </div>
        </form>

        {message && <p className="mt-3 text-sm text-[var(--color-accent)]">{message}</p>}
        {error && <p className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
      </section>
    </div>
  );
}
