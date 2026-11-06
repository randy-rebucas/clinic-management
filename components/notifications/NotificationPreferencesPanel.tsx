'use client';

import { useState, type FormEvent } from 'react';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { FIELD, FOCUS_RING } from '../appointments/shared';

interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string | null;
}

interface Preferences {
  pausedUntil: string | null;
  quietHours: QuietHours;
}

const URL_PATH = '/api/notifications/preferences';

const OUTLINE_BUTTON = `inline-flex w-fit items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`;

const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const pauseLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function tomorrowMorning() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  next.setHours(8, 0, 0, 0);
  return next;
}

async function savePreferences(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(URL_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) return null;
    return json?.issues?.[0]?.message || json?.error || 'Could not save your settings.';
  } catch {
    return 'Could not save your settings.';
  }
}

function QuietHoursForm({ initial, onSaved }: { initial: QuietHours; onSaved: (error: string | null) => void }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const error = await savePreferences({
      quietHours: { enabled, start, end, timezone: initial.timezone ?? browserTimezone() },
    });
    setBusy(false);
    onSaved(error);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal"
        />
        Quiet hours every day
      </label>
      <p className="text-sm text-gray-600">High-priority and urgent alerts still come through.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="quiet-start" className="mb-1.5 block text-sm font-medium text-gray-700">From</label>
          <input id="quiet-start" type="time" required disabled={!enabled} value={start} onChange={(e) => setStart(e.target.value)} className={`${FIELD} font-mono`} />
        </div>
        <div>
          <label htmlFor="quiet-end" className="mb-1.5 block text-sm font-medium text-gray-700">To</label>
          <input id="quiet-end" type="time" required disabled={!enabled} value={end} onChange={(e) => setEnd(e.target.value)} className={`${FIELD} font-mono`} />
        </div>
        <button type="submit" disabled={busy} aria-busy={busy} className={OUTLINE_BUTTON}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

/**
 * When pushes may interrupt you. Held pushes aren't lost: the notification is still here on
 * this page. The rules live in lib/notification-policy.ts.
 */
export default function NotificationPreferencesPanel() {
  const { value, error: loadError, receivedAt, reload } = useKeyedFetch<Preferences>(URL_PATH);
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const paused = !!value?.pausedUntil && new Date(value.pausedUntil).getTime() > receivedAt;

  function finished(error: string | null, success: string) {
    setStatus(error ? { error: true, text: error } : { error: false, text: success });
    if (!error) reload();
  }

  async function setPause(until: Date | null) {
    setBusy(true);
    const error = await savePreferences({ pausedUntil: until ? until.toISOString() : null });
    setBusy(false);
    finished(error, until ? 'Notifications paused.' : 'Notifications resumed.');
  }

  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-gray-900 ${FOCUS_RING}`}>
        Delivery settings
        {paused && value?.pausedUntil && (
          <span className="text-sm font-normal text-gray-600">
            Paused until <span className="font-mono">{pauseLabel(value.pausedUntil)}</span>
          </span>
        )}
      </summary>

      <div className="space-y-5 border-t border-gray-200 px-4 py-4">
        {loadError && <p role="alert" className="text-sm text-rose-700">{loadError}</p>}

        {value && (
          <>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-900">Pause notifications</p>
              <p className="text-sm text-gray-600">
                Only urgent alerts come through. Everything else waits here, without a push.
              </p>
              <div className="flex flex-wrap gap-2">
                {paused ? (
                  <button type="button" disabled={busy} onClick={() => setPause(null)} className={OUTLINE_BUTTON}>
                    Resume now
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={busy} onClick={() => setPause(new Date(Date.now() + 3_600_000))} className={OUTLINE_BUTTON}>
                      For 1 hour
                    </button>
                    <button type="button" disabled={busy} onClick={() => setPause(tomorrowMorning())} className={OUTLINE_BUTTON}>
                      Until tomorrow morning
                    </button>
                  </>
                )}
              </div>
            </div>

            <QuietHoursForm
              key={JSON.stringify(value.quietHours)}
              initial={value.quietHours}
              onSaved={(error) => finished(error, 'Quiet hours saved.')}
            />
          </>
        )}

        {status && (
          <p role={status.error ? 'alert' : 'status'} className={`text-sm ${status.error ? 'text-rose-700' : 'text-gray-600'}`}>
            {status.text}
          </p>
        )}
      </div>
    </details>
  );
}
