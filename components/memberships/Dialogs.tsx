'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { Label } from '../visits/form/parts';
import { pts } from './shared';
import { MEMBERSHIP_TIERS, TIER, benefitLabel, type MembershipTier } from '@/lib/memberships';

type Send = (url: string, method: 'POST' | 'PUT', body: unknown) => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;

/** One request helper for the dialogs: 401 goes to login, failures come back as words. */
function useSend(fallback: string): Send {
  const router = useRouter();
  return async (url, method, body) => {
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 401) {
        router.push('/login');
        return { ok: false, error: 'Signed out.' };
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return { ok: false, error: formatApiError(json, fallback) };
      return { ok: true, data: json.data };
    } catch {
      return { ok: false, error: 'The server couldn’t be reached. Nothing was saved; try again.' };
    }
  };
}

function Frame({
  ids,
  title,
  subtitle,
  busy,
  onClose,
  onSubmit,
  status,
  statusTone,
  submitLabel,
  children,
}: {
  ids: string;
  title: string;
  subtitle: ReactNode;
  busy: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  status: ReactNode;
  statusTone: 'plain' | 'error';
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-xl" labelledBy={`${ids}-title`}>
      <form onSubmit={onSubmit} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
        </div>
        <div className="grid gap-5 px-6 py-5">{children}</div>
        <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${statusTone === 'error' ? 'font-medium text-red-700' : 'text-gray-600'}`} role={statusTone === 'error' ? 'alert' : undefined} aria-live="polite">
            {status}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Svg d={ICON.check} />
              {busy ? 'Saving…' : submitLabel}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

const SEGMENT =
  'cursor-pointer rounded px-2 py-1.5 text-center text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1';

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

type PointsMode = 'earn' | 'redeem' | 'adjustment';
const MODE_LABEL: Record<PointsMode, string> = { earn: 'Add points', redeem: 'Use points', adjustment: 'Correct' };
const SUGGEST: Record<PointsMode, string[]> = {
  earn: ['Visit', 'Birthday', 'Promotion'],
  redeem: ['Used on a bill', 'Exchanged for a free consultation'],
  adjustment: ['Entered twice by mistake', 'Points owed from an earlier visit'],
};

/**
 * Add earned points, use points, or (for whoever manages memberships) correct the balance
 * either way. Shows the balance it will leave; using more than the balance is stopped here
 * and again by the API.
 */
export function PointsDialog({
  membershipId,
  name,
  balance,
  canCorrect,
  initialMode = 'earn',
  onClose,
  onDone,
}: {
  membershipId: string;
  name: string;
  balance: number;
  canCorrect: boolean;
  initialMode?: PointsMode;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const send = useSend('The points could not be saved');
  const [mode, setMode] = useState<PointsMode>(initialMode);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = Number(amount);
  const valid = amount.trim() !== '' && Number.isInteger(n) && n !== 0 && (mode === 'adjustment' || n > 0);
  const change = !valid ? 0 : mode === 'redeem' ? -n : n;
  const after = balance + change;
  const amountProblem = !valid
    ? mode === 'adjustment'
      ? 'Enter a whole number of points; a minus sign takes them off.'
      : 'Enter a whole number of points.'
    : after < 0
      ? `That is more than the ${pts(balance)} points ${name} has.`
      : null;
  const noteProblem = note.trim() ? null : 'Say what the points are for; it shows in their history.';
  const problems = (amountProblem ? 1 : 0) + (noteProblem ? 1 : 0);
  const modes: PointsMode[] = canCorrect ? ['earn', 'redeem', 'adjustment'] : ['earn', 'redeem'];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problems) return;
    setBusy(true);
    setError(null);
    const r = await send(`/api/memberships/${membershipId}/points`, 'POST', { type: mode, points: n, description: note.trim() });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const word = mode === 'earn' ? `Added ${pts(n)}` : mode === 'redeem' ? `Used ${pts(n)}` : `Corrected by ${n > 0 ? '+' : '−'}${pts(Math.abs(n))}`;
    onDone(`${word} points. ${name} now has ${pts(after)}.`);
  };

  const showAmount = attempted || amount.trim() !== '' ? amountProblem : null;

  return (
    <Frame
      ids={ids}
      title="Points"
      subtitle={
        <>
          {name} has <span className="font-mono text-gray-900">{pts(balance)}</span> points.
        </>
      }
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
      statusTone={error || (attempted && problems) ? 'error' : 'plain'}
      status={
        error ??
        (attempted && problems ? (
          `${problems === 1 ? 'One thing needs' : 'Two things need'} fixing.`
        ) : valid && after >= 0 ? (
          <>
            Leaves <span className="font-mono font-semibold text-gray-900">{pts(after)}</span> points.
          </>
        ) : (
          'Enter the points.'
        ))
      }
      submitLabel={MODE_LABEL[mode]}
    >
      <fieldset>
        <legend className="sr-only">What to do</legend>
        <div className={`grid gap-1 rounded-md border border-gray-300 bg-white p-1 ${modes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {modes.map((m) => (
            <label key={m} className={SEGMENT}>
              <input type="radio" name={`${ids}-mode`} value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <Label htmlFor={`${ids}-pts`}>Points</Label>
        <input
          id={`${ids}-pts`}
          type="number"
          inputMode="numeric"
          step={1}
          min={mode === 'adjustment' ? undefined : 1}
          max={mode === 'redeem' ? balance : undefined}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={Boolean(showAmount)}
          aria-describedby={`${ids}-pts-msg`}
          className={`${FIELD} font-mono tabular-nums sm:w-48 ${showAmount ? 'border-red-400' : ''}`}
        />
        <p id={`${ids}-pts-msg`} className={`mt-1.5 ${showAmount ? 'text-sm font-medium text-red-700' : 'text-xs text-gray-500'}`}>
          {showAmount ??
            (mode === 'redeem' ? (
              <>
                Up to <span className="font-mono">{pts(balance)}</span>.
              </>
            ) : mode === 'adjustment' ? (
              'Use a minus sign to take points off. Corrections are kept in the history like any other entry.'
            ) : (
              'Whole points.'
            ))}
        </p>
      </div>
      <div>
        <Label htmlFor={`${ids}-note`}>For</Label>
        <input
          id={`${ids}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          autoComplete="off"
          aria-invalid={attempted && Boolean(noteProblem)}
          className={`${FIELD} ${attempted && noteProblem ? 'border-red-400' : ''}`}
        />
        {attempted && noteProblem ? (
          <p className="mt-1.5 text-sm font-medium text-red-700">{noteProblem}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGEST[mode].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setNote(s)}
                className={`rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:border-brand-teal-dark hover:bg-brand-teal-light/50 hover:text-brand-teal-deep ${FOCUS_RING}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Tier
// ---------------------------------------------------------------------------

export function TierDialog({
  membershipId,
  name,
  current,
  onClose,
  onDone,
}: {
  membershipId: string;
  name: string;
  current: MembershipTier;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const send = useSend('The tier could not be changed');
  const [tier, setTier] = useState<MembershipTier>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (tier === current) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    const r = await send(`/api/memberships/${membershipId}`, 'PUT', { tier });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onDone(`${name} is now ${TIER[tier].label}: ${TIER[tier].discount}% off bills from now on.`);
  };

  const t = TIER[tier];
  const up = t.rank > TIER[current].rank;

  return (
    <Frame
      ids={ids}
      title="Change tier"
      subtitle={`${name} is ${TIER[current].label}. The new discount applies to bills made from now on; bills already made keep theirs.`}
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
      statusTone={error ? 'error' : 'plain'}
      status={error ?? (tier === current ? 'Choose another tier.' : `${up ? 'Up' : 'Down'} to ${t.label}, ${t.discount}% off.`)}
      submitLabel={tier === current ? 'Keep tier' : `Move to ${t.label}`}
    >
      <fieldset>
        <legend className="sr-only">Tier</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {MEMBERSHIP_TIERS.map((k) => (
            <label
              key={k}
              className="cursor-pointer rounded-md border border-gray-300 bg-white px-4 py-3 transition-colors hover:border-gray-900 has-[:checked]:border-brand-teal-dark has-[:checked]:bg-brand-teal-light/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
            >
              <input type="radio" name={`${ids}-tier`} value={k} checked={tier === k} onChange={() => setTier(k)} className="sr-only" />
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-gray-900">
                  {TIER[k].label}
                  {k === current && <span className="ml-1.5 text-xs font-medium text-gray-500">current</span>}
                </span>
                <span className="font-mono text-sm text-gray-900">{TIER[k].discount}%</span>
              </span>
              <span className="mt-1 block text-xs text-gray-500">{TIER[k].benefits.map(benefitLabel).join(' · ')}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// End date and notes
// ---------------------------------------------------------------------------

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function DetailsDialog({
  membershipId,
  expiryDate,
  notes,
  active,
  onClose,
  onDone,
}: {
  membershipId: string;
  expiryDate?: string | null;
  notes?: string;
  /** An active membership can't be given an end date that has passed. */
  active: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const ids = useId();
  const send = useSend('The changes could not be saved');
  const [until, setUntil] = useState(expiryDate ? dateKey(new Date(expiryDate)) : '');
  const [noEnd, setNoEnd] = useState(!expiryDate);
  const [text, setText] = useState(notes ?? '');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = dateKey(new Date());
  const dateProblem = !noEnd && !until ? 'Choose a date, or tick “No end date”.' : !noEnd && active && until < today ? 'An active membership can’t end in the past. Pick a later date.' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (dateProblem) return;
    setBusy(true);
    setError(null);
    const r = await send(`/api/memberships/${membershipId}`, 'PUT', {
      expiryDate: noEnd ? null : new Date(`${until}T23:59:59`).toISOString(),
      notes: text,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onDone('Changes saved.');
  };

  return (
    <Frame
      ids={ids}
      title="End date and notes"
      subtitle="Renewing adds a year for you; set a date here only to make an exception."
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
      statusTone={error || (attempted && dateProblem) ? 'error' : 'plain'}
      status={error ?? (attempted && dateProblem ? 'One thing needs fixing.' : 'Reminders follow the new date.')}
      submitLabel="Save"
    >
      <div>
        <Label htmlFor={`${ids}-until`}>Valid until</Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <input
            id={`${ids}-until`}
            type="date"
            value={until}
            disabled={noEnd}
            onChange={(e) => setUntil(e.target.value)}
            aria-invalid={attempted && Boolean(dateProblem)}
            className={`${FIELD} font-mono sm:w-48 ${attempted && dateProblem ? 'border-red-400' : ''}`}
          />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
            No end date
          </label>
        </div>
        {attempted && dateProblem && <p className="mt-1.5 text-sm font-medium text-red-700">{dateProblem}</p>}
      </div>
      <div>
        <Label htmlFor={`${ids}-notes`} optional>
          Notes for staff
        </Label>
        <textarea id={`${ids}-notes`} value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={10000} className={FIELD} />
      </div>
    </Frame>
  );
}

export { useSend };
