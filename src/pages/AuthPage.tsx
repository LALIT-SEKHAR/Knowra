import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowLeft, Check, LoaderCircle, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { BrandMark } from '../components/BrandMark';

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function AuthPage() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (step !== 'otp') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [step]);

  const expiresIn = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000))
    : 0;
  const resendIn = resendAvailableAt
    ? Math.max(0, Math.ceil((new Date(resendAvailableAt).getTime() - now) / 1000))
    : 0;
  const expired = Boolean(expiresAt) && expiresIn === 0;
  const canResend = !busy && !resending && resendIn === 0;

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  function applyOtpTiming(result: { expiresAt: string; resendAvailableAt: string }) {
    setExpiresAt(result.expiresAt);
    setResendAvailableAt(result.resendAvailableAt);
    setNow(Date.now());
  }

  async function onRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.requestOtp(email);
      applyOtpTiming(result);
      setCode('');
      setStep('otp');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (typeof err.details.resendAvailableAt === 'string') {
          setResendAvailableAt(err.details.resendAvailableAt);
        }
      } else {
        setError('Failed to send code');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onResendOtp() {
    if (!canResend) return;
    setError('');
    setResending(true);
    try {
      const result = await api.requestOtp(email);
      applyOtpTiming(result);
      setCode('');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (typeof err.details.resendAvailableAt === 'string') {
          setResendAvailableAt(err.details.resendAvailableAt);
          setNow(Date.now());
        }
      } else {
        setError('Failed to resend code');
      }
    } finally {
      setResending(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.verifyOtp(email.trim(), code.replace(/\s+/g, ''));
      if (result.deletionCancelled) {
        try {
          sessionStorage.setItem(
            'knowra_notice',
            'Welcome back — your scheduled account deletion was cancelled.',
          );
        } catch {
          // ignore
        }
      }
      await login(result.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell relative flex min-h-full items-start justify-center sm:items-center">
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
        <BrandMark size="lg" tagline stacked />

        <div className="glass mt-8 p-5 sm:mt-10 sm:p-7">
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

              <p
                className={`text-sm ${expired ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink-muted)]'}`}
                aria-live="polite"
              >
                {expired
                  ? 'Code expired. Request a new one to continue.'
                  : `Code expires in ${formatCountdown(expiresIn)}`}
              </p>

              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

              <button type="submit" disabled={busy || expired} className="btn btn-primary w-full">
                {busy ? (
                  <LoaderCircle className="icon animate-spin" aria-hidden />
                ) : (
                  <Check className="icon" aria-hidden />
                )}
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>

              <button
                type="button"
                className="btn btn-secondary w-full text-sm"
                disabled={!canResend}
                onClick={() => void onResendOtp()}
              >
                {resending ? (
                  <LoaderCircle className="icon animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="icon" aria-hidden />
                )}
                {resending
                  ? 'Resending…'
                  : resendIn > 0
                    ? `Resend code in ${formatCountdown(resendIn)}`
                    : 'Resend code'}
              </button>

              <button
                type="button"
                className="btn btn-ghost w-full text-sm"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                  setExpiresAt(null);
                  setResendAvailableAt(null);
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
