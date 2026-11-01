'use client';

import { useEffect, useState } from 'react';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { DEFAULT_REP_VISIT_SETTINGS, repVisitSettingsSchema, type RepVisitSettings, type RepVisitWindow } from '@/lib/rep-visit-rules';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOT_OPTIONS: RepVisitSettings['slotMinutes'][] = [10, 15, 20, 30, 60];
const PRIMARY = `rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;
const OUTLINE = `rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`;

function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
      <label htmlFor={id} className="text-sm">
        <span className="font-semibold text-gray-900">{label}</span>
        <span className="block text-gray-600">{hint}</span>
      </label>
    </div>
  );
}

/** The clinic's visiting hours for medical reps: when reps can book, how many at once, and who may. */
export default function RepVisitHoursPanel() {
  const [s, setS] = useState<RepVisitSettings>(DEFAULT_REP_VISIT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/rep-visits/settings')
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (d.success) setS(d.data);
        else setNotice({ tone: 'error', text: d.error || 'Could not load visiting hours' });
      })
      .catch(() => live && setNotice({ tone: 'error', text: 'Could not load visiting hours' }))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const setWindow = (i: number, patch: Partial<RepVisitWindow>) =>
    setS((prev) => ({ ...prev, windows: prev.windows.map((w, j) => (j === i ? { ...w, ...patch } : w)) }));
  const addWindow = () =>
    setS((prev) => {
      const last = prev.windows[prev.windows.length - 1];
      const next: RepVisitWindow = last
        ? { ...last, dayOfWeek: (last.dayOfWeek + 1) % 7 }
        : { dayOfWeek: 2, start: '15:00', end: '17:00', maxReps: 3 };
      return { ...prev, windows: [...prev.windows, next] };
    });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const check = repVisitSettingsSchema.safeParse(s);
    if (!check.success) {
      setNotice({ tone: 'error', text: check.error.issues[0]?.message ?? 'Check the visiting hours' });
      return;
    }
    if (s.enabled && !s.windows.length) {
      setNotice({ tone: 'error', text: 'Add at least one visiting window before turning rep booking on.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/rep-visits/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Could not save');
      setS(d.data);
      setNotice({ tone: 'ok', text: 'Visiting hours saved.' });
    } catch (err) {
      setNotice({ tone: 'error', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-lg border border-gray-200 bg-white" aria-label="Loading" />;

  return (
    <form onSubmit={save} className="flex max-w-3xl flex-col gap-6 rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <Toggle
          id="rep-enabled"
          checked={s.enabled}
          onChange={(v) => setS({ ...s, enabled: v })}
          label="Reps can book visits in the app"
          hint="They pick a slot in your visiting hours; you approve or decline each request here."
        />
        <Toggle
          id="rep-open"
          checked={s.openToAllReps}
          onChange={(v) => setS({ ...s, openToAllReps: v })}
          label="Open to any rep on MyClinicSoft"
          hint="Off: only reps you have added can find you. On: any activated rep can ask; approving one adds them to your list."
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-gray-900">Visiting windows</legend>
        {!s.windows.length && <p className="text-sm text-gray-600">No windows yet. Add the times your doctors can see reps, for example Tuesdays 3–5 PM.</p>}
        {s.windows.map((w, i) => (
          <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
            <label className="text-xs font-medium text-gray-600">
              Day
              <select value={w.dayOfWeek} onChange={(e) => setWindow(i, { dayOfWeek: Number(e.target.value) })} className={`${FIELD} mt-1`}>
                {DAYS.map((d, n) => (
                  <option key={d} value={n}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-600">
              From
              <input type="time" value={w.start} onChange={(e) => setWindow(i, { start: e.target.value })} className={`${FIELD} mt-1`} />
            </label>
            <label className="text-xs font-medium text-gray-600">
              To
              <input type="time" value={w.end} onChange={(e) => setWindow(i, { end: e.target.value })} className={`${FIELD} mt-1`} />
            </label>
            <label className="text-xs font-medium text-gray-600">
              Reps per slot
              <input type="number" min={1} max={20} value={w.maxReps} onChange={(e) => setWindow(i, { maxReps: Number(e.target.value) })} className={`${FIELD} mt-1`} />
            </label>
            <button
              type="button"
              aria-label={`Remove ${DAYS[w.dayOfWeek]} window`}
              onClick={() => setS({ ...s, windows: s.windows.filter((_, j) => j !== i) })}
              className={`mb-0.5 justify-self-start rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
            >
              <Svg d={ICON.x} />
            </button>
          </div>
        ))}
        <div>
          <button type="button" onClick={addWindow} disabled={s.windows.length >= 28} className={OUTLINE}>
            Add window
          </button>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          Slot length
          <select value={s.slotMinutes} onChange={(e) => setS({ ...s, slotMinutes: Number(e.target.value) as RepVisitSettings['slotMinutes'] })} className={`${FIELD} mt-1`}>
            {SLOT_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Reps can book up to
          <span className="mt-1 flex items-center gap-2">
            <input type="number" min={1} max={90} value={s.maxAdvanceDays} onChange={(e) => setS({ ...s, maxAdvanceDays: Number(e.target.value) })} className={FIELD} />
            <span className="shrink-0 text-gray-600">days ahead</span>
          </span>
        </label>
      </div>

      <label className="text-sm font-medium text-gray-700">
        Instructions for reps
        <textarea
          rows={3}
          maxLength={1000}
          value={s.instructions}
          onChange={(e) => setS({ ...s, instructions: e.target.value })}
          placeholder="e.g. Check in at the front desk. Samples go to the pharmacy room, not the consult room."
          className={`${FIELD} mt-1`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={PRIMARY}>
          {saving ? 'Saving…' : 'Save visiting hours'}
        </button>
        {notice && (
          <p role="status" className={`text-sm font-medium ${notice.tone === 'error' ? 'text-red-700' : 'text-brand-teal-deep'}`}>
            {notice.text}
          </p>
        )}
      </div>
    </form>
  );
}
