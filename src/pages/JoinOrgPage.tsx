import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, LoaderCircle, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { BrandMark } from '../components/BrandMark';

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function JoinOrgPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading, login, refreshUser } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [joinsEnabled, setJoinsEnabled] = useState(true);
  const [missing, setMissing] = useState(false);
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
    let cancelled = false;
    void api
      .orgInvite(slug)
      .then((result) => {
        if (!cancelled) {
          setOrgName(result.organization.name);
          setJoinsEnabled(result.organization.joinsEnabled !== false);
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

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

  async function onJoinExisting() {
    setBusy(true);
    setError('');
    try {
      await api.joinOrg(slug);
      await refreshUser();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join this organization');
    } finally {
      setBusy(false);
    }
  }

  async function onRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await api.requestOtp(email);
      setExpiresAt(result.expiresAt);
      setResendAvailableAt(result.resendAvailableAt);
      setNow(Date.now());
      setCode('');
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
      const result = await api.verifyOtp(email.trim(), code.replace(/\s+/g, ''), { joinSlug: slug });
      await login(result.token);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="page-shell relative flex min-h-full items-start justify-center sm:items-center">
      <div className="relative z-10 w-full max-w-md">
        <BrandMark size="lg" tagline stacked />
        <div className="glass mt-8 p-5 sm:mt-10 sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight">Join {orgName || 'organization'}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            You can ask questions in this organization. File and model settings stay with the admin.
          </p>

          {loading ? (
            <p className="mt-6 text-sm text-[var(--color-ink-muted)]">Loading…</p>
          ) : !joinsEnabled && !user?.memberships?.some((membership) => membership.slug === slug) ? (
            <p className="mt-6 text-sm text-[var(--color-ink-muted)]">
              This organization is not accepting new members.
            </p>
          ) : user ? (
            <div className="mt-6 space-y-3">
              <p className="text-sm text-[var(--color-ink-muted)]">
                Signed in as <strong className="text-[var(--color-ink)]">{user.email}</strong>
              </p>
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <button type="button" disabled={busy} className="btn btn-primary w-full" onClick={() => void onJoinExisting()}>
                {busy ? <LoaderCircle className="icon animate-spin" aria-hidden /> : <Check className="icon" aria-hidden />}
                {busy ? 'Joining…' : 'Join organization'}
              </button>
            </div>
          ) : step === 'email' ? (
            <form className="mt-6 space-y-4" onSubmit={onRequestOtp}>
              <label className="block text-sm font-medium">
                Email
                <div className="relative mt-1.5">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 icon -translate-y-1/2 text-[var(--color-ink-muted)]" aria-hidden />
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
              <button type="submit" disabled={busy || !orgName} className="btn btn-primary w-full">
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={onVerify}>
              <label className="block text-sm font-medium">
                Verification code
                <div className="relative mt-1.5">
                  <ShieldCheck className="pointer-events-none absolute top-1/2 left-3 icon -translate-y-1/2 text-[var(--color-ink-muted)]" aria-hidden />
                  <input
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
              <p className={`text-sm ${expired ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink-muted)]'}`}>
                {expired ? 'Code expired. Request a new one to continue.' : `Code expires in ${formatCountdown(expiresIn)}`}
              </p>
              {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
              <button type="submit" disabled={busy || expired} className="btn btn-primary w-full">
                {busy ? 'Verifying…' : 'Join organization'}
              </button>
              <button
                type="button"
                className="btn btn-secondary w-full text-sm"
                disabled={!canResend}
                onClick={() => {
                  setResending(true);
                  void api
                    .requestOtp(email)
                    .then((result) => {
                      setExpiresAt(result.expiresAt);
                      setResendAvailableAt(result.resendAvailableAt);
                      setNow(Date.now());
                      setCode('');
                    })
                    .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to resend code'))
                    .finally(() => setResending(false));
                }}
              >
                {resending ? <LoaderCircle className="icon animate-spin" aria-hidden /> : <RefreshCw className="icon" aria-hidden />}
                {resendIn > 0 ? `Resend code in ${formatCountdown(resendIn)}` : 'Resend code'}
              </button>
              <button type="button" className="btn btn-ghost w-full text-sm" onClick={() => setStep('email')}>
                <ArrowLeft className="icon" aria-hidden />
                Use a different email
              </button>
            </form>
          )}

          {!user && (
            <p className="mt-4 text-center text-sm text-[var(--color-ink-muted)]">
              <Link to="/auth" className="underline">
                Use Knowra without this invite
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
