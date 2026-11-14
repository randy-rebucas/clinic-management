'use client';

import { useActionState, useState } from 'react';
import { requestPlatformLink, confirmPlatformLink, type PlatformLinkState } from '@/app/actions/platform-auth';
import TurnstileWidget, { TURNSTILE_SITE_KEY } from '../TurnstileWidget';
import { FIELD, FOCUS_RING } from '../appointments/shared';

const BUTTON = `w-full rounded-md bg-brand-teal-dark px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;

type AttemptState = (NonNullable<PlatformLinkState> & { attempt: number }) | undefined;

/** Counts attempts so the security check remounts with a fresh (single-use) token after each one. */
async function requestAttempt(prev: AttemptState, formData: FormData): Promise<AttemptState> {
  return { ...(await requestPlatformLink(prev, formData)), attempt: (prev?.attempt ?? 0) + 1 };
}

export function RequestLinkForm() {
  const [state, action, pending] = useActionState(requestAttempt, undefined);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  if (state?.sent) {
    return (
      <p role="status" className="rounded-md bg-brand-teal-light px-4 py-3 text-sm text-brand-navy">
        If that address belongs to a platform admin, we&rsquo;ve sent it a sign-in link. It works once, for 15 minutes.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className={FIELD} />
      </div>
      {TURNSTILE_SITE_KEY && (
        <div>
          <TurnstileWidget key={state?.attempt ?? 0} onToken={setCaptchaToken} />
          <input type="hidden" name="turnstileToken" value={captchaToken ?? ''} />
        </div>
      )}
      {state?.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      <button type="submit" disabled={pending || (!!TURNSTILE_SITE_KEY && !captchaToken)} className={BUTTON}>
        {pending ? 'Creating…' : 'Get a sign-in link'}
      </button>
    </form>
  );
}

export function ConfirmLinkForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(confirmPlatformLink, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      <button type="submit" disabled={pending} className={BUTTON}>{pending ? 'Signing in…' : 'Sign in to the platform console'}</button>
    </form>
  );
}
