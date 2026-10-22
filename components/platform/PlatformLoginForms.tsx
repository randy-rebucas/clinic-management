'use client';

import { useActionState } from 'react';
import { requestPlatformLink, confirmPlatformLink } from '@/app/actions/platform-auth';
import { FIELD, FOCUS_RING } from '../appointments/shared';

const BUTTON = `w-full rounded-md bg-brand-teal-dark px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;

export function RequestLinkForm() {
  const [state, action, pending] = useActionState(requestPlatformLink, undefined);
  if (state?.sent) {
    return (
      <p role="status" className="rounded-md bg-brand-teal-light px-4 py-3 text-sm text-brand-navy">
        If that address belongs to a platform admin, a sign-in link has been written to the server log. It works once, for 15 minutes.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className={FIELD} />
      </div>
      {state?.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      <button type="submit" disabled={pending} className={BUTTON}>{pending ? 'Creating…' : 'Get a sign-in link'}</button>
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
