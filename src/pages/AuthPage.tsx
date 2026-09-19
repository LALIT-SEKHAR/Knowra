import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

export function AuthPage() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function onRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.requestOtp(email);
      setStep('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send code');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.verifyOtp(email.trim(), code.replace(/\s+/g, ''));
      await login(result.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <p className="font-[family-name:var(--font-display)] text-4xl tracking-tight text-[var(--color-ink)]">
          Knowra
        </p>
        <p className="mt-2 text-[var(--color-ink-muted)]">Ask. Explore. Understand.</p>

        <div className="mt-10 border border-[var(--color-line)] bg-[var(--color-panel)]/80 p-6 backdrop-blur">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Passwordless email OTP — no password needed.
          </p>

          {step === 'email' ? (
            <form className="mt-6 space-y-4" onSubmit={onRequestOtp}>
              <label className="block text-sm font-medium">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full border border-[var(--color-line)] bg-white px-3 py-2 outline-none focus:border-[var(--color-accent)]"
                  placeholder="you@example.com"
                />
              </label>
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-[var(--color-accent)] px-4 py-2.5 text-white disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={onVerify}>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Enter the code sent to <strong>{email}</strong>
              </p>
              <label className="block text-sm font-medium">
                Verification code
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
                  className="mt-1 w-full border border-[var(--color-line)] bg-white px-3 py-2 tracking-widest outline-none focus:border-[var(--color-accent)]"
                  placeholder="123456"
                />
              </label>
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-[var(--color-accent)] px-4 py-2.5 text-white disabled:opacity-60"
              >
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button
                type="button"
                className="w-full text-sm text-[var(--color-ink-muted)] underline"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                }}
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
