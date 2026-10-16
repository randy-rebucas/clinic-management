'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '../ui/Modal';
import { formatApiError } from '../utils/apiError';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { Label } from '../visits/form/parts';
import PatientSearch, { type PatientOption } from '../patients/PatientSearch';
import { MEMBERSHIP_TIERS, REFERRAL_BONUS, TIER, benefitLabel, type MembershipTier } from '@/lib/memberships';

const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inAYear = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return dateKey(d);
};

/**
 * Enrol a patient. Everyone who may enrol starts members at Bronze; choosing a higher tier is
 * for whoever manages memberships (the API enforces the same). The end date starts a year out.
 */
export default function EnrolDialog({ canChooseTier, onClose }: { canChooseTier: boolean; onClose: () => void }) {
  const ids = useId();
  const router = useRouter();
  const [patient, setPatient] = useState<PatientOption | null>(null);
  const [referrer, setReferrer] = useState<PatientOption | null>(null);
  const [tier, setTier] = useState<MembershipTier>('bronze');
  const [until, setUntil] = useState(inAYear);
  const [noEnd, setNoEnd] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; existingId?: string } | null>(null);

  const today = dateKey(new Date());
  const patientProblem = !patient ? 'Choose the patient to enrol.' : null;
  const referrerProblem = patient && referrer && referrer._id === patient._id ? 'A patient can’t refer themselves.' : null;
  const dateProblem = !noEnd && (!until || until <= today) ? 'Choose an end date after today, or tick “No end date”.' : null;
  const problems = [patientProblem, referrerProblem, dateProblem].filter(Boolean).length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problems > 0 || !patient) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: patient._id,
          tier: canChooseTier ? tier : undefined,
          referredBy: referrer?._id,
          // End of the chosen day in the clinic's local time.
          expiryDate: noEnd ? null : new Date(`${until}T23:59:59`).toISOString(),
        }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError({ text: formatApiError(json, 'The patient could not be enrolled'), existingId: json?.existingId });
        return;
      }
      router.push(`/memberships/${json.data._id}?saved=enrolled`);
    } catch {
      setError({ text: 'The server couldn’t be reached. Nothing was saved; try again.' });
    } finally {
      setBusy(false);
    }
  };

  const t = TIER[canChooseTier ? tier : 'bronze'];

  return (
    <Modal open onOpenChange={(o) => !o && !busy && onClose()} className="max-w-xl" labelledBy={`${ids}-title`} closeOnBackdrop={false}>
      <form onSubmit={submit} noValidate>
        <div className="border-b border-gray-200 px-6 py-5">
          <h2 id={`${ids}-title`} className="text-lg font-bold tracking-tight text-gray-900">
            Enrol a patient
          </h2>
          <p className="mt-1 text-sm text-gray-600">They get a membership number, the tier’s discount on every bill, and start earning points.</p>
        </div>

        <div className="grid gap-5 px-6 py-5">
          <div>
            <PatientSearch label="Patient" value={patient} onChange={setPatient} autoFocus />
            {attempted && patientProblem && <p className="mt-1.5 text-sm font-medium text-red-700">{patientProblem}</p>}
          </div>

          {canChooseTier ? (
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-gray-700">Tier</legend>
              <div className="grid grid-cols-2 gap-1 rounded-md border border-gray-300 bg-white p-1 sm:grid-cols-4">
                {MEMBERSHIP_TIERS.map((k) => (
                  <label
                    key={k}
                    className="cursor-pointer rounded px-2 py-1.5 text-center text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                  >
                    <input type="radio" name={`${ids}-tier`} value={k} checked={tier === k} onChange={() => setTier(k)} className="sr-only" />
                    {TIER[k].label} <span className="font-mono text-xs opacity-80">{TIER[k].discount}%</span>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">{t.benefits.map(benefitLabel).join(' · ')}</p>
            </fieldset>
          ) : (
            <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
              Starts at <span className="font-semibold text-gray-900">Bronze</span>, <span className="font-mono">{TIER.bronze.discount}%</span> off every bill. Someone who manages memberships can move them to a higher tier.
            </p>
          )}

          <div>
            <Label htmlFor={`${ids}-until`}>Valid until</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <input
                id={`${ids}-until`}
                type="date"
                value={until}
                min={today}
                disabled={noEnd}
                onChange={(e) => setUntil(e.target.value)}
                aria-invalid={attempted && Boolean(dateProblem)}
                className={`${FIELD} font-mono sm:w-48 disabled:bg-gray-50 disabled:text-gray-400 ${attempted && dateProblem ? 'border-red-400' : ''}`}
              />
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
                No end date
              </label>
            </div>
            {attempted && dateProblem ? (
              <p className="mt-1.5 text-sm font-medium text-red-700">{dateProblem}</p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">The patient is reminded by text and email 30, 14, 7, 3 and 1 days before it ends.</p>
            )}
          </div>

          <div>
            <PatientSearch label="Referred by" value={referrer} onChange={setReferrer} optional />
            {referrerProblem ? (
              <p className="mt-1.5 text-sm font-medium text-red-700">{referrerProblem}</p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">
                {referrer ? (
                  <>
                    The new member starts with <span className="font-mono">{REFERRAL_BONUS}</span> points; {referrer.firstName} gets <span className="font-mono">{REFERRAL_BONUS}</span> too if they are a member.
                  </>
                ) : (
                  <>
                    Whoever brought them in. Each gets <span className="font-mono">{REFERRAL_BONUS}</span> points.
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${error || (attempted && problems) ? 'font-medium text-red-700' : 'text-gray-600'}`} role={error ? 'alert' : undefined} aria-live="polite">
            {error ? (
              <>
                {error.text}
                {error.existingId && (
                  <>
                    {' '}
                    <Link href={`/memberships/${error.existingId}`} className={`rounded font-semibold underline hover:text-red-900 ${FOCUS_RING}`}>
                      Open it
                    </Link>
                  </>
                )}
              </>
            ) : attempted && problems ? (
              `${problems === 1 ? 'One thing needs' : `${problems} things need`} fixing.`
            ) : patient ? (
              <>
                {patient.firstName} joins at {t.label}, <span className="font-mono">{t.discount}%</span> off.
              </>
            ) : (
              'Choose who to enrol.'
            )}
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
              {busy ? 'Enrolling…' : 'Enrol'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
