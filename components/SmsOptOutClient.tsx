'use client';

import { useState } from 'react';

export default function SmsOptOutClient({ token, clinicName, phone }: { token: string; clinicName: string; phone: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState('');

  const confirm = async () => {
    setState('saving');
    setError('');
    try {
      const res = await fetch('/api/public/sms-opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setState('done');
    } catch (err) {
      setState('idle');
      setError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.');
    }
  };

  if (state === 'done') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8" role="status">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">You won&rsquo;t get texts from {clinicName}</h1>
        <p className="mt-2 text-gray-600">Sign-in codes still arrive when you ask for one. To start texts again, ask the clinic.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Stop texts from {clinicName}?</h1>
      <p className="mt-2 text-gray-600">
        {phone} will stop getting all texts from this clinic, including appointment reminders and queue updates.
      </p>
      {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
      <button
        type="button"
        onClick={confirm}
        disabled={state === 'saving'}
        className="mt-5 inline-flex items-center justify-center rounded-md bg-brand-teal-dark px-5 py-2.5 font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60"
      >
        {state === 'saving' ? 'Saving…' : 'Stop texts'}
      </button>
    </div>
  );
}
