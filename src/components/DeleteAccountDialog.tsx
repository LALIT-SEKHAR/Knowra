import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { ApiError } from '../services/api';

type OtpTiming = {
  expiresAt: string;
  resendAvailableAt: string;
};

type Props = {
  open: boolean;
  email: string;
  busy: boolean;
  graceDays?: number;
  onCancel: () => void;
  onRequestCode: () => Promise<OtpTiming>;
  onConfirmDelete: (code: string) => Promise<void>;
};

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function DeleteAccountDialog({
  open,
  email,
  busy,
  graceDays = 7,
  onCancel,
  onRequestCode,
  onConfirmDelete,
}: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<'confirm' | 'otp'>('confirm');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');
  const [sending, setSending] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) {
      setStep('confirm');
      setCode('');
      setLocalError('');
      setSending(false);
      setExpiresAt(null);
      setResendAvailableAt(null);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy && !sending) onCancel();
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, busy, sending, onCancel]);

  useEffect(() => {
    if (!open || step !== 'otp') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, step]);

  if (!open) return null;

  const expiresIn = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000))
    : 0;
  const resendIn = resendAvailableAt
    ? Math.max(0, Math.ceil((new Date(resendAvailableAt).getTime() - now) / 1000))
    : 0;
  const expired = Boolean(expiresAt) && expiresIn === 0;
  const locked = busy || sending;
  const canResend = !locked && resendIn === 0;

  async function handleSendCode() {
    setLocalError('');
    setSending(true);
    try {
      const timing = await onRequestCode();
      setExpiresAt(timing.expiresAt);
      setResendAvailableAt(timing.resendAvailableAt);
      setNow(Date.now());
      setCode('');
      setStep('otp');
    } catch (err) {
      if (err instanceof ApiError) {
        setLocalError(err.message);
        if (typeof err.details.resendAvailableAt === 'string') {
          setResendAvailableAt(err.details.resendAvailableAt);
          setNow(Date.now());
        }
      } else {
        setLocalError(err instanceof Error ? err.message : 'Failed to send code');
      }
    } finally {
      setSending(false);
    }
  }

  async function handleDelete() {
    const trimmed = code.replace(/\s+/g, '');
    if (trimmed.length < 4) {
      setLocalError('Enter the verification code from your email.');
      return;
    }
    setLocalError('');
    try {
      await onConfirmDelete(trimmed);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to schedule deletion');
    }
  }

  return (
    <div className="confirm-overlay" role="presentation" onMouseDown={locked ? undefined : onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="confirm-dialog glass"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-[family-name:var(--font-display)] text-xl tracking-tight">
          {step === 'confirm' ? 'Schedule account deletion?' : 'Enter verification code'}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {step === 'confirm' ? (
            <>
              After you verify, your account stays available for{' '}
              <strong className="text-[var(--color-ink)]">{graceDays} days</strong>. Sign in again
              during that window to cancel. After {graceDays} days we permanently delete your
              account, files, chats, and all related data. We’ll email a code to{' '}
              <strong className="text-[var(--color-ink)]">{email}</strong>.
            </>
          ) : (
            <>
              Enter the 6-digit code sent to <strong className="text-[var(--color-ink)]">{email}</strong>.
              Deletion will be scheduled — not immediate.
            </>
          )}
        </p>

        {step === 'otp' ? (
          <>
            <label className="mt-4 block text-sm font-medium">
              Verification code
              <div className="relative mt-1.5">
                <ShieldCheck
                  className="pointer-events-none absolute top-1/2 left-3 size-[16px] -translate-y-1/2 text-[var(--color-ink-muted)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code"
                  className="field !pl-10 tracking-[0.2em]"
                  disabled={locked || expired}
                />
              </div>
            </label>
            <p
              className={`mt-2 text-sm ${expired ? 'text-[var(--color-danger)]' : 'text-[var(--color-ink-muted)]'}`}
              aria-live="polite"
            >
              {expired
                ? 'Code expired. Request a new one to continue.'
                : `Code expires in ${formatCountdown(expiresIn)}`}
            </p>
          </>
        ) : null}

        {localError ? <p className="mt-3 text-sm text-[var(--color-danger)]">{localError}</p> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary"
            disabled={locked}
            onClick={onCancel}
          >
            Cancel
          </button>
          {step === 'confirm' ? (
            <button type="button" className="btn btn-danger-soft" disabled={locked} onClick={() => void handleSendCode()}>
              {sending ? (
                <>
                  <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                  Sending…
                </>
              ) : (
                'Send verification code'
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canResend}
                onClick={() => void handleSendCode()}
              >
                {sending
                  ? 'Resending…'
                  : resendIn > 0
                    ? `Resend in ${formatCountdown(resendIn)}`
                    : 'Resend code'}
              </button>
              <button
                type="button"
                className="btn btn-danger-soft"
                disabled={locked || expired}
                onClick={() => void handleDelete()}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="icon-sm animate-spin" aria-hidden />
                    Scheduling…
                  </>
                ) : (
                  'Schedule deletion'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
