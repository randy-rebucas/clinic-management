'use client';

import { useEffect, useState } from 'react';

interface Preference {
  hasPhone: boolean;
  optedOut: boolean;
  optedOutEverywhere?: boolean;
  promoOptIn: boolean;
}

/** What this patient's number agreed to. Kept per number, so family sharing a phone share it. */
export default function PatientSmsPreference({ patientId }: { patientId: string }) {
  const [pref, setPref] = useState<Preference | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`/api/patients/${patientId}/sms-preference`)
      .then((res) => res.json())
      .then((data) => {
        if (live && data.success) setPref(data.data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [patientId]);

  if (!pref?.hasPhone) return null;

  const change = async (next: Partial<Pick<Preference, 'optedOut' | 'promoOptIn'>>) => {
    const before = pref;
    setPref({ ...pref, ...next });
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/patients/${patientId}/sms-preference`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch {
      setPref(before);
      setError('Couldn’t save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4" aria-label="Text message preferences">
      <h3 className="text-sm font-semibold text-gray-900">Text messages</h3>
      <p className="mt-1 text-xs text-gray-500">Applies to this mobile number, including anyone sharing it.</p>
      {pref.optedOutEverywhere && (
        <p className="mt-2 text-sm text-amber-800">This patient turned texts off in the eMCR app. Only they can turn them back on.</p>
      )}
      <label className="mt-3 flex items-start gap-2 text-sm text-gray-800">
        <input type="checkbox" checked={!pref.optedOut} disabled={saving} onChange={(e) => change({ optedOut: !e.target.checked })} className="mt-0.5" />
        <span>Reminders and notices from this clinic</span>
      </label>
      <label className="mt-2 flex items-start gap-2 text-sm text-gray-800">
        <input type="checkbox" checked={pref.promoOptIn} disabled={saving} onChange={(e) => change({ promoOptIn: e.target.checked })} className="mt-0.5" />
        <span>Agreed to health reminders, greetings and offers</span>
      </label>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}
