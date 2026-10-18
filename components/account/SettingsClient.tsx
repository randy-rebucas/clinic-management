'use client';

import { useState } from 'react';
import type { AccountActivity } from '@/lib/account';
import { deviceLabel } from '@/lib/user-agent';
import { AlertDialog } from '../ui/Modal';
import {
  AccountHeader,
  DANGER_BUTTON,
  FIELD,
  Field,
  Notice,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  Section,
  dateLabel,
  describe,
  readJson,
  type FieldErrors,
} from './shared';

const PASSWORD_MIN = 12;

export default function SettingsClient({
  email,
  totpEnabled,
  activity,
}: {
  email: string;
  totpEnabled: boolean;
  activity: AccountActivity[];
}) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <AccountHeader title="Sign-in & security" subtitle={`How you sign in as ${email}.`} current="settings" />
        <div>
          <PasswordSection />
          <TwoStepSection initialEnabled={totpEnabled} />
          <SessionsSection activity={activity} />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const clear = (key: string) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    setNotice(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: FieldErrors = {};
    if (!current) local.currentPassword = ['Enter your current password.'];
    if ([...next].length < PASSWORD_MIN) local.newPassword = [`Use at least ${PASSWORD_MIN} characters.`];
    if (next !== confirm) local.confirmPassword = ['The two new passwords don’t match.'];
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await readJson(res);
      if (!res.ok || !body.success) {
        setErrors(body.fieldErrors ?? {});
        setNotice({ tone: 'error', text: body.error || 'Could not change your password. Try again.' });
        return;
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      setErrors({});
      setNotice({ tone: 'success', text: 'Password changed. You’ve been signed out everywhere else.' });
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  }

  const type = show ? 'text' : 'password';

  return (
    <Section
      id="password"
      title="Password"
      description={`At least ${PASSWORD_MIN} characters. A short sentence is easier to remember than symbols. Changing it signs you out on every other device.`}
    >
      <form onSubmit={submit} noValidate className="flex flex-col">
        {/* Lets password managers file the new password under the right account. */}
        <input type="text" name="username" autoComplete="username" value="" readOnly hidden />
        <div className="grid gap-4 p-5 sm:max-w-md">
          <Field id="currentPassword" label="Current password" errors={errors.currentPassword}>
            <input
              id="currentPassword"
              type={type}
              value={current}
              onChange={(e) => { setCurrent(e.target.value); clear('currentPassword'); }}
              autoComplete="current-password"
              className={FIELD}
              {...describe('currentPassword', errors.currentPassword)}
            />
          </Field>
          <Field id="newPassword" label="New password" errors={errors.newPassword} hint={<StrengthHint value={next} />}>
            <input
              id="newPassword"
              type={type}
              value={next}
              onChange={(e) => { setNext(e.target.value); clear('newPassword'); }}
              autoComplete="new-password"
              className={FIELD}
              {...describe('newPassword', errors.newPassword, true)}
            />
          </Field>
          <Field id="confirmPassword" label="New password again" errors={errors.confirmPassword}>
            <input
              id="confirmPassword"
              type={type}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); clear('confirmPassword'); }}
              autoComplete="new-password"
              className={FIELD}
              {...describe('confirmPassword', errors.confirmPassword)}
            />
          </Field>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
            />
            Show passwords
          </label>
        </div>
        <Footer notice={notice}>
          <button type="submit" className={PRIMARY_BUTTON} disabled={saving || (!current && !next && !confirm)}>
            {saving ? 'Changing…' : 'Change password'}
          </button>
        </Footer>
      </form>
    </Section>
  );
}

function StrengthHint({ value }: { value: string }) {
  const length = [...value].length;
  if (length === 0) return <>{`${PASSWORD_MIN} characters or more.`}</>;
  if (length < PASSWORD_MIN) return <>{`${PASSWORD_MIN - length} more character${PASSWORD_MIN - length === 1 ? '' : 's'} to go.`}</>;
  return <span className="text-brand-teal-deep">Long enough.</span>;
}

// ---------------------------------------------------------------------------
// Two-step verification
// ---------------------------------------------------------------------------

type TwoStepMode =
  | { kind: 'idle' }
  | { kind: 'confirm-reset'; withPassword: boolean } // enabled: a code (or the password) before moving to a new phone
  | { kind: 'enrol'; qr: string; secret: string }
  | { kind: 'disable' };

function TwoStepSection({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [mode, setMode] = useState<TwoStepMode>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = (nextMode: TwoStepMode = { kind: 'idle' }) => {
    setMode(nextMode);
    setCode('');
    setPassword('');
    setError(null);
  };

  async function call(path: string, payload: Record<string, string> = {}) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, body: await readJson(res) };
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const startEnrol = (payload?: Record<string, string>) =>
    run(async () => {
      const { ok, body } = await call('/api/auth/2fa/setup', payload);
      if (!ok || !body.success) {
        setError(body.error || 'Could not start setup. Try again.');
        return;
      }
      reset({ kind: 'enrol', qr: body.data.qrCodeDataUrl, secret: body.data.manualEntryKey });
    });

  const confirmEnrol = () =>
    run(async () => {
      const { ok, body } = await call('/api/auth/2fa/verify', { token: code.replace(/\s+/g, '') });
      if (!ok || !body.success) {
        setError(body.error === 'Invalid or expired token' ? 'That code didn’t work. Wait for the next one and try again.' : body.error || 'Could not confirm the code.');
        return;
      }
      const wasEnabled = enabled;
      setEnabled(true);
      reset();
      setNotice(wasEnabled ? 'Your new phone is set up. The old one no longer works.' : 'Two-step verification is on. You’ll be asked for a code each time you sign in.');
    });

  const disable = () =>
    run(async () => {
      const { ok, body } = await call('/api/auth/2fa/disable', { token: code.replace(/\s+/g, '') });
      if (!ok || !body.success) {
        setError(body.error === 'Invalid or expired token' ? 'That code didn’t work. Wait for the next one and try again.' : body.error || 'Could not turn it off.');
        return;
      }
      setEnabled(false);
      reset();
      setNotice('Two-step verification is off.');
    });

  const codeValid = /^\d{6}$/.test(code.replace(/\s+/g, ''));
  const canSubmitIdentity = mode.kind === 'confirm-reset' && mode.withPassword ? password.length > 0 : codeValid;

  return (
    <Section
      id="two-step"
      title="Two-step verification"
      description="After your password, you enter a 6-digit code from an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator."
    >
      <div className="flex flex-col">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                enabled ? 'bg-brand-teal-light text-brand-teal-deep ring-brand-teal/30' : 'bg-amber-50 text-amber-800 ring-amber-200'
              }`}
            >
              {enabled ? 'On' : 'Off'}
            </span>
            <p className="text-sm text-gray-700">
              {enabled ? 'A code is needed every time you sign in.' : 'Only your password protects this account.'}
            </p>
          </div>
          {mode.kind === 'idle' && (
            <div className="flex flex-wrap gap-2">
              {enabled ? (
                <>
                  <button type="button" className={SECONDARY_BUTTON} onClick={() => reset({ kind: 'confirm-reset', withPassword: false })}>
                    Move to a new phone
                  </button>
                  <button type="button" className={SECONDARY_BUTTON} onClick={() => reset({ kind: 'disable' })}>
                    Turn off
                  </button>
                </>
              ) : (
                <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={() => startEnrol()}>
                  {busy ? 'Starting…' : 'Turn on'}
                </button>
              )}
            </div>
          )}
        </div>

        {mode.kind === 'enrol' && (
          <form
            className="motion-panel-in border-t border-gray-200 p-5 flex flex-col gap-5 sm:flex-row"
            onSubmit={(e) => { e.preventDefault(); if (codeValid) confirmEnrol(); }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from the setup route */}
            <img src={mode.qr} alt="QR code to scan with your authenticator app" width={176} height={176} className="h-44 w-44 shrink-0 rounded-md border border-gray-200 bg-white" />
            <ol className="flex flex-col gap-4 text-sm text-gray-700 list-decimal pl-5 min-w-0">
              <li>Open your authenticator app and scan this code.</li>
              <li>
                Can’t scan? Choose “enter a key” and type:
                <code className="mt-1 block break-all rounded bg-gray-100 px-2 py-1 font-mono text-sm tracking-wider text-gray-900 select-all">
                  {mode.secret.replace(/(.{4})/g, '$1 ').trim()}
                </code>
              </li>
              <li className="flex flex-col gap-2">
                <CodeInput id="enrol-code" label="Enter the 6-digit code the app shows" value={code} onChange={setCode} error={error} />
                <div className="flex gap-2">
                  <button type="submit" className={PRIMARY_BUTTON} disabled={!codeValid || busy}>
                    {busy ? 'Checking…' : 'Confirm and turn on'}
                  </button>
                  <button type="button" className={SECONDARY_BUTTON} onClick={() => reset()}>
                    Cancel
                  </button>
                </div>
              </li>
            </ol>
          </form>
        )}

        {(mode.kind === 'disable' || mode.kind === 'confirm-reset') && (
          <form
            className="motion-panel-in border-t border-gray-200 p-5 flex flex-col gap-3 sm:max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSubmitIdentity) return;
              if (mode.kind === 'disable') disable();
              else if (mode.withPassword) startEnrol({ password });
              else startEnrol({ token: code.replace(/\s+/g, '') });
            }}
          >
            <p className="text-sm text-gray-700">
              {mode.kind === 'disable'
                ? 'To turn it off, enter a current code from your authenticator app.'
                : mode.withPassword
                  ? 'Enter your password. You’ll then scan a new QR code with the new phone.'
                  : 'Enter a current code from your old phone. You’ll then scan a new QR code with the new one.'}
            </p>
            {mode.kind === 'confirm-reset' && mode.withPassword ? (
              <Field id="reset-password" label="Password" errors={error ? [error] : undefined}>
                <input
                  id="reset-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  className={FIELD}
                  {...describe('reset-password', error ? [error] : undefined)}
                />
              </Field>
            ) : (
              <CodeInput id="current-code" label="6-digit code" value={code} onChange={setCode} error={error} />
            )}
            <div className="flex gap-2">
              <button type="submit" className={mode.kind === 'disable' ? DANGER_BUTTON : PRIMARY_BUTTON} disabled={!canSubmitIdentity || busy}>
                {busy ? 'Checking…' : mode.kind === 'disable' ? 'Turn off' : 'Continue'}
              </button>
              <button type="button" className={SECONDARY_BUTTON} onClick={() => reset()}>
                Cancel
              </button>
            </div>
            {mode.kind === 'confirm-reset' && (
              <button
                type="button"
                className="self-start text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                onClick={() => reset({ kind: 'confirm-reset', withPassword: !mode.withPassword })}
              >
                {mode.withPassword ? 'Use a code instead' : 'Lost the old phone? Use your password'}
              </button>
            )}
          </form>
        )}

        {mode.kind === 'idle' && (error || notice) && (
          <div className="border-t border-gray-200 px-5 py-3">
            <Notice tone={error ? 'error' : 'success'}>{error || notice}</Notice>
          </div>
        )}
      </div>
    </Section>
  );
}

function CodeInput({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (v: string) => void; error: string | null }) {
  const errors = error ? [error] : undefined;
  return (
    <Field id={id} label={label} errors={errors}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="123 456"
        className={`${FIELD} max-w-[10rem] font-mono tracking-[0.2em]`}
        {...describe(id, errors)}
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Sessions and recent activity
// ---------------------------------------------------------------------------

function SessionsSection({ activity }: { activity: AccountActivity[] }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  async function signOutOthers() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/account/sessions', { method: 'DELETE' });
      const body = await readJson(res);
      setNotice(
        res.ok && body.success
          ? { tone: 'success', text: 'Signed out everywhere else. This browser stays signed in.' }
          : { tone: 'error', text: body.error || 'Could not sign out other sessions. Try again.' }
      );
    } catch {
      setNotice({ tone: 'error', text: 'Could not reach the server. Check your connection and try again.' });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <Section
      id="sessions"
      title="Where you’re signed in"
      description="Recent sign-ins to your account. If one wasn’t you, change your password: that signs out every other device."
    >
      <div className="flex flex-col">
        {activity.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">No sign-ins recorded yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activity.map((a, i) => (
              <li key={a.id} className="motion-row-in flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" style={{ animationDelay: `${Math.min(i, 6) * 30}ms` }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {a.action === 'login' ? deviceLabel(a.userAgent) : 'Password changed'}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {a.action === 'login'
                      ? `Signed in${a.ipAddress ? ` from ${a.ipAddress}` : ''}`
                      : `${deviceLabel(a.userAgent)}${a.ipAddress ? `, ${a.ipAddress}` : ''}`}
                  </p>
                </div>
                <time dateTime={a.at} className="text-sm text-gray-600 tabular-nums shrink-0">
                  {dateLabel(a.at, true)}
                </time>
              </li>
            ))}
          </ul>
        )}
        <Footer notice={notice}>
          <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => setConfirming(true)}>
            Sign out everywhere else
          </button>
        </Footer>
      </div>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => !busy && setConfirming(open)}
        title="Sign out everywhere else?"
        description="Other browsers, the mobile app and calendar links stop working until you sign in there again. You stay signed in here."
      >
        <button type="button" className={SECONDARY_BUTTON} disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </button>
        <button type="button" className={PRIMARY_BUTTON} disabled={busy} onClick={signOutOthers}>
          {busy ? 'Signing out…' : 'Sign out others'}
        </button>
      </AlertDialog>
    </Section>
  );
}

function Footer({ notice, children }: { notice: { tone: 'success' | 'error'; text: string } | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between rounded-b-lg">
      <div className="min-h-[1.5rem]" aria-live="polite">
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      </div>
      <div className="flex gap-2 sm:justify-end">{children}</div>
    </div>
  );
}
