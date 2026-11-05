'use client';

import { useState } from 'react';
import { TURNSTILE_SITE_KEY } from './TurnstileWidget';

export interface PhoneProof {
  token: string;
  /** The visitor agreed to health reminders and offers from this clinic. */
  promoConsent: boolean;
}

interface Props {
  phone: string;
  purpose: 'booking' | 'registration';
  tenantId?: string;
  /** Spent by sending a code, so the form's widget must remount after this reports a send. */
  captchaToken: string | null;
  onCaptchaUsed: () => void;
  onVerified: (proof: PhoneProof) => void;
}

/** Confirms the visitor's mobile number with a texted code, inside a public form. */
export default function PhoneCodeStep({ phone, purpose, tenantId, captchaToken, onCaptchaUsed, onVerified }: Props) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [promoConsent, setPromoConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/public/phone-verification/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, purpose, tenantId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.success) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      try {
        await post('start', { turnstileToken: captchaToken ?? undefined });
        setSent(true);
      } finally {
        onCaptchaUsed();
      }
    });

  const check = () =>
    run(async () => {
      const data = await post('check', { code: code.trim() });
      onVerified({ token: data.proof, promoConsent });
    });

  return (
    <div className="rounded-lg border border-brand-teal/30 bg-brand-teal/5 p-4">
      <p className="font-semibold text-gray-900">Confirm your mobile number</p>
      <p className="mt-1 text-sm text-gray-600">
        {sent ? `We texted a 6-digit code to ${phone}. It expires in 10 minutes.` : `We’ll text a 6-digit code to ${phone}.`}
      </p>

      {sent && (
        <div className="mt-3">
          <label htmlFor="phone-code" className="block text-sm font-medium text-gray-900">Code</label>
          <input
            id="phone-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="mt-1 w-36 rounded-md border border-gray-300 px-3 py-2 font-mono tracking-widest"
          />
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={promoConsent} onChange={(e) => setPromoConsent(e.target.checked)} className="mt-0.5" />
            <span>Also text me health reminders, greetings and offers from this clinic. I can stop these at any time.</span>
          </label>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {sent && (
          <button
            type="button"
            onClick={check}
            disabled={busy || code.length !== 6}
            className="rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Checking…' : 'Confirm'}
          </button>
        )}
        <button
          type="button"
          onClick={send}
          disabled={busy || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}
          className={`rounded-md px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
            sent ? 'border border-gray-300 bg-white text-gray-900 hover:border-gray-900' : 'bg-brand-teal-dark text-white hover:bg-brand-teal-deep'
          }`}
        >
          {sent ? 'Send again' : busy ? 'Sending…' : 'Send code'}
        </button>
      </div>
    </div>
  );
}
