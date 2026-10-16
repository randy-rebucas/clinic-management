'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertDialog, Modal } from '../ui/Modal';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING, ICON, Svg, localKey } from '../appointments/shared';
import { usePatientSummary } from '../visits/form/PatientSummary';
import { FieldError, Label, NoteArea } from '../visits/form/parts';
import type { ReferralStatus } from '@/lib/referrals';

/** PUT one state step; resolves to an error message, or null when it went through. */
export function useReferralStatus(referralId: string) {
  const router = useRouter();
  return async (body: { status: ReferralStatus; declinedReason?: string; completedOn?: string; visit?: string }, fallback: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/referrals/${referralId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.push('/login');
        return fallback;
      }
      const json = await res.json().catch(() => null);
      return !res.ok || !json?.success ? formatApiError(json, fallback) : null;
    } catch {
      return `${fallback}. Check your connection and try again.`;
    }
  };
}

function Frame({
  title,
  intro,
  busy,
  error,
  status,
  submitLabel,
  busyLabel,
  danger,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  intro: ReactNode;
  busy: boolean;
  error: string | null;
  status?: string;
  submitLabel: string;
  busyLabel: string;
  danger?: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
}) {
  const ids = useId();
  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-lg" labelledBy={`${ids}-title`}>
      <form onSubmit={onSubmit} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            {title}
          </h2>
          <div className="mt-1 text-sm text-gray-600">{intro}</div>
        </div>
        <div className="grid gap-4 px-6 py-5">{children}</div>
        <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error ? 'font-medium text-red-700' : 'text-gray-600'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ?? status ?? ''}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}>
              Back
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-60 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-teal-dark hover:bg-brand-teal-deep'} ${FOCUS_RING}`}
            >
              <Svg d={ICON.check} />
              {busy ? busyLabel : submitLabel}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Declining needs a reason: it is what the referring doctor reads when finding the patient another place. */
export function DeclineDialog({
  referralId,
  who,
  outgoing,
  onClose,
  onDone,
}: {
  referralId: string;
  who: string;
  /** Sent out: the outside doctor declined, and staff record it. */
  outgoing: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const send = useReferralStatus(referralId);
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = !reason.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (missing || busy) return;
    setBusy(true);
    setError(null);
    const err = await send({ status: 'declined', declinedReason: reason.trim() }, 'The referral could not be marked declined');
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <Frame
      title={outgoing ? 'Mark as declined' : 'Decline this referral'}
      intro={
        outgoing ? (
          <>The doctor or clinic {who} was sent to said no. The referral stays on file as declined, so the patient can be referred somewhere else.</>
        ) : (
          <>{who} will need another place. The reason stays on the referral for whoever referred them.</>
        )
      }
      busy={busy}
      error={error}
      status={attempted && missing ? 'Say why before saving.' : undefined}
      submitLabel="Mark declined"
      busyLabel="Saving…"
      danger
      onClose={onClose}
      onSubmit={submit}
    >
      <div>
        <Label htmlFor={`${ids}-reason`}>Reason</Label>
        <NoteArea
          id={`${ids}-reason`}
          rows={3}
          value={reason}
          onChange={setReason}
          placeholder={outgoing ? 'e.g. Not accepting new patients until January' : 'e.g. Outside my specialty; refer to a cardiologist'}
          invalid={attempted && missing}
          describedBy={attempted && missing ? `${ids}-err` : undefined}
        />
        {attempted && missing && <FieldError id={`${ids}-err`}>Say why the referral was declined.</FieldError>}
      </div>
    </Frame>
  );
}

/** Seen: the day the patient was seen, and (for a doctor here) the visit it happened at. */
export function SeenDialog({
  referralId,
  patientId,
  who,
  referredDay,
  canPickVisit,
  onClose,
  onDone,
}: {
  referralId: string;
  patientId: string | null;
  who: string;
  /** yyyy-mm-dd the referral was made; the seen date can't be earlier. */
  referredDay: string;
  canPickVisit: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const send = useReferralStatus(referralId);
  const [today] = useState(() => localKey(new Date()));
  const [on, setOn] = useState(today);
  const [visit, setVisit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = usePatientSummary(canPickVisit ? patientId : null);
  const visits = (summary.data?.visits ?? []).filter((v) => localKey(new Date(v.date)) >= referredDay);
  const badDate = !on || on > today || on < referredDay;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (badDate || busy) return;
    setBusy(true);
    setError(null);
    const err = await send({ status: 'completed', completedOn: on, ...(visit ? { visit } : {}) }, 'The referral could not be marked seen');
    setBusy(false);
    if (err) setError(err);
    else onDone();
  };

  return (
    <Frame
      title="Mark as seen"
      intro={<>{who} was seen by the doctor they were referred to. This closes the referral.</>}
      busy={busy}
      error={error}
      status={badDate ? `Choose a day between the referral and today.` : undefined}
      submitLabel="Mark seen"
      busyLabel="Saving…"
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="sm:max-w-[12rem]">
        <Label htmlFor={`${ids}-on`}>Seen on</Label>
        <input id={`${ids}-on`} type="date" value={on} min={referredDay} max={today} onChange={(e) => setOn(e.target.value)} aria-invalid={badDate} className={`${FIELD} font-mono ${badDate ? 'border-red-400' : ''}`} />
      </div>
      {canPickVisit && (
        <div>
          <Label htmlFor={`${ids}-visit`} optional>
            At visit
          </Label>
          <select id={`${ids}-visit`} value={visit} onChange={(e) => setVisit(e.target.value)} className={FIELD} disabled={!summary.data}>
            <option value="">{summary.data ? (visits.length ? 'Not linked to a visit' : 'No visits since the referral') : summary.error ? 'Visits didn’t load' : 'Loading visits…'}</option>
            {visits.map((v) => (
              <option key={v._id} value={v._id}>
                {v.visitCode} · {new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {v.chiefComplaint ? ` · ${v.chiefComplaint.slice(0, 40)}` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-500">A linked visit opens from the referral.</p>
        </div>
      )}
    </Frame>
  );
}

export function CancelReferralDialog({ who, code, busy, onClose, onConfirm }: { who: string; code?: string; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <AlertDialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Cancel this referral?"
      description={`${who}${code ? `, ${code}` : ''}. It stays on file marked cancelled, its letter can no longer be printed or verified, and no follow-up reminder goes out. Refer the patient again if they still need it.`}
    >
      <button type="button" onClick={onClose} disabled={busy} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
        Keep referral
      </button>
      <button type="button" onClick={onConfirm} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}>
        <Svg d={ICON.x} />
        {busy ? 'Cancelling…' : 'Cancel referral'}
      </button>
    </AlertDialog>
  );
}
