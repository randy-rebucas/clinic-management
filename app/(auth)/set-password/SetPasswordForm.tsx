'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { setPasswordWithToken } from '@/app/actions/auth';

const inputClass =
  'w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-colors bg-white hover:border-gray-400 text-base';

function FieldErrors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800 font-semibold">
      {errors.map((e) => (
        <p key={e}>{e}</p>
      ))}
    </div>
  );
}

export default function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setPasswordWithToken, undefined);

  if (state?.success) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
        <p className="font-semibold">Your password has been set.</p>
        <Link href={state.loginPath || '/login'} className="underline mt-1 inline-block">
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          autoFocus
          className={inputClass}
        />
        <FieldErrors errors={state?.errors?.password} />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={inputClass}
        />
        <FieldErrors errors={state?.errors?.confirmPassword} />
      </div>

      {state?.message && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          <p className="font-semibold">{state.message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-6 py-3 bg-brand-teal hover:bg-brand-teal-dark disabled:bg-brand-teal/60 text-white font-semibold rounded-md transition-colors duration-150 disabled:cursor-not-allowed"
      >
        {pending ? 'Saving...' : 'Set password'}
      </button>
    </form>
  );
}
