'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { verifyLoginTotp } from '@/app/actions/auth';

export default function TwoFactorForm() {
  const [state, action, pending] = useActionState(verifyLoginTotp, undefined);

  return (
    <form action={action} className="space-y-6">
      <div>
        <label htmlFor="code" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
          Authentication code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          placeholder="123456"
          className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal outline-none transition-colors bg-white hover:border-gray-400 text-base tracking-widest"
        />
        {state?.errors?.code && (
          <p className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800 font-semibold">
            {state.errors.code[0]}
          </p>
        )}
      </div>

      {state?.message && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          <p className="font-semibold">{state.message}</p>
          <Link href="/login" className="underline mt-1 inline-block">Back to sign in</Link>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full px-6 py-3 bg-brand-teal hover:bg-brand-teal-dark disabled:bg-brand-teal/60 text-white font-semibold rounded-md transition-colors duration-150 disabled:cursor-not-allowed"
      >
        {pending ? 'Verifying...' : 'Verify'}
      </button>
    </form>
  );
}
