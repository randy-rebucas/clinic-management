'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RepSignupConfirmClient({ token }: { token: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/medical-representatives/onboard/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (typeof data.checkoutUrl === 'string' && data.checkoutUrl.startsWith('https://')) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      router.push(`/medical-representatives/onboard/success?id=${data.id}`);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Confirm your registration</h1>
      <p className="mt-2 text-gray-600">Press the button to confirm your email and finish registering as a medical representative.</p>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <button
        type="button"
        onClick={confirm}
        disabled={saving || !token}
        className="mt-5 inline-flex items-center justify-center rounded-md bg-brand-teal-dark px-5 py-2.5 font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? 'Confirming…' : 'Confirm and continue'}
      </button>
    </div>
  );
}
