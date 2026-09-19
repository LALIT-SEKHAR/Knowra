import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowLeft, Check, LoaderCircle, Mail, ShieldCheck } from 'lucide-react';
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
    <div className="page-shell relative flex min-h-full items-center justify-center">
      <div
        className="ambient-orb left-[5%] top-[8%] bg-white/12"
        aria-hidden
      />
      <div
        className="ambient-orb bottom-[5%] right-[8%] bg-white/6"
        style={{ animationDelay: '-4s' }}
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md">
        <p className="font-[family-name:var(--font-display)] text-4xl tracking-tight text-[var(--color-ink)]">
          Knowra
        </p>
        <p className="mt-2 text-[var(--color-ink-muted)]">Ask. Explore. Understand.</p>

        <div className="glass mt-10 p-6 sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Passwordless email OTP — no password needed.
          </p>

          {step === 'email' ? (
            <form className="mt-6 space-y-4" onSubmit={onRequestOtp}>
              <label className="block text-sm font-medium">
                Email
                <div className="relative mt-1.5">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3 icon -translate-y-1/2 text-[var(--color-ink-muted)]"
                    aria-hidden
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="field !pl-10"
                    placeholder="you@example.com"
                  />
                </div>
              </label>
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <button type="submit" disabled={busy} className="btn btn-primary w-full">
                {busy ? (
                  <LoaderCircle className="icon animate-spin" aria-hidden />
                ) : (
                  <Mail className="icon" aria-hidden />
                )}
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={onVerify}>
              <p className="text-sm text-[var(--color-ink-muted)]">
                Enter the code sent to <strong className="text-[var(--color-ink)]">{email}</strong>
              </p>
              <label className="block text-sm font-medium">
                Verification code
                <div className="relative mt-1.5">
                  <ShieldCheck
                    className="pointer-events-none absolute top-1/2 left-3 icon -translate-y-1/2 text-[var(--color-ink-muted)]"
                    aria-hidden
                  />
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
                    className="field !pl-10 tracking-[0.35em]"
                    placeholder="123456"
                  />
                </div>
              </label>
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <button type="submit" disabled={busy} className="btn btn-primary w-full">
                {busy ? (
                  <LoaderCircle className="icon animate-spin" aria-hidden />
                ) : (
                  <Check className="icon" aria-hidden />
                )}
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button
                type="button"
                className="btn btn-ghost w-full text-sm"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                }}
              >
                <ArrowLeft className="icon" aria-hidden />
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
