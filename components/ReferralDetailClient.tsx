'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg, localKey, timeLabel } from './appointments/shared';
import { ageFrom } from './visits/form/PatientSummary';
import { DIRECTION_LABEL, LATE_AFTER_DAYS, OPEN_STATUSES } from '@/lib/referrals';
import type { ReferralDetailPermissions } from '@/lib/referrals-page';
import { REF_STATE, URGENCY_BADGE, daysSince, direction, doctorName, fromLabel, personName, shortDate, specialtyOf, toLabel, waitedLabel, type Referral } from './referrals/shared';
import { CancelReferralDialog, DeclineDialog, SeenDialog, useReferralStatus } from './referrals/StatusDialogs';
import PdfLink from './documents/PdfLink';

type Scheduled = { _id: string; appointmentCode?: string; appointmentDate: string; appointmentTime?: string; status?: string } | null;

const ICONS = {
  ...ICON,
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  pen: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  thumbDown: 'M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5',
  link: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14',
};

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
/** Birth dates are stored at UTC midnight; read them in UTC so they never slip a day. */
const birthDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const safeUrl = (u: string) => /^https?:\/\//i.test(u);
const URGENCY_WORDS = { routine: 'Routine', urgent: 'Urgent, to be seen soon', stat: 'STAT, as soon as possible' } as const;

type Dialog = 'decline' | 'seen' | 'cancel' | null;

export default function ReferralDetailClient({
  referralId,
  permissions,
  saved,
}: {
  referralId: string;
  permissions: ReferralDetailPermissions;
  saved?: 'new' | 'edit';
}) {
  const ref = useKeyedFetch<Referral>(`/api/referrals/${referralId}`);
  const send = useReferralStatus(referralId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(saved === 'edit' ? 'Changes saved.' : null);
  // "Saved, print the letter" stays until dismissed: it says what to do next.
  const [created, setCreated] = useState(saved === 'new');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const r = ref.value;
  const scheduled = (ref.raw?.scheduled as Scheduled | undefined) ?? null;

  const step = async (status: 'accepted' | 'cancelled', message: string, fallback: string) => {
    setBusy(true);
    setActionError(null);
    const err = await send({ status }, fallback);
    setBusy(false);
    setDialog(null);
    if (err) {
      setActionError(err);
      return;
    }
    done(message);
  };

  const done = (message: string) => {
    setDialog(null);
    setCreated(false);
    ref.reload();
    setNotice(message);
  };

  // --- Not loaded ----------------------------------------------------------------

  if (!r && ref.error) {
    const missing = /not found/i.test(ref.error);
    const denied = /permission|forbidden|not allowed/i.test(ref.error);
    return (
      <Shell>
        <BackLink />
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing || denied ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing || denied ? ICONS.doc : ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Referral not found' : denied ? 'You can’t open this referral' : 'This referral didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {missing ? 'It may have been deleted, or it belongs to another clinic.' : denied ? 'Ask a clinic admin if you need access to referrals.' : `${ref.error}. Check your connection and try again.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/referrals" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All referrals
            </Link>
            {!missing && !denied && (
              <button type="button" onClick={ref.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!r) {
    return (
      <Shell>
        <BackLink />
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-72 rounded-lg border border-gray-200 bg-white" />
            <div className="h-56 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading referral…
        </span>
      </Shell>
    );
  }

  // --- Loaded --------------------------------------------------------------------

  const st = REF_STATE[r.status] ?? REF_STATE.pending;
  const cancelled = r.status === 'cancelled';
  const open = OPEN_STATUSES.includes(r.status);
  const d = direction(r);
  const sending = d === 'internal' || d === 'out';
  const who = personName(r.patient) ?? 'Patient record unavailable';
  const urgency = r.urgency && r.urgency !== 'routine' ? URGENCY_BADGE[r.urgency] : undefined;
  const canAct = permissions.canUpdate && open;
  const canPrint = sending && !cancelled && r.status !== 'declined';
  const canBook = permissions.canBook && open && Boolean(r.receivingDoctor && r.patient) && !r.appointment && !scheduled;
  const specialty = r.specialty || specialtyOf(r.receivingDoctor);
  const waited = r.status === 'pending' ? daysSince(r.referredDate) : 0;

  const hasClinical = Boolean(r.chiefComplaint || r.diagnosis || r.relevantHistory || (r.medications?.length ?? 0) > 0);

  return (
    <Shell>
      <BackLink />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${cancelled ? 'text-gray-500 line-through decoration-gray-400 decoration-2' : 'text-gray-900'}`}>{who}</h1>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
            {urgency && !cancelled && <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${urgency.badge}`}>{urgency.label}</span>}
            {r.referralCode && <span className="font-mono text-sm text-gray-500">{r.referralCode}</span>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm sm:text-base text-gray-600">
            <span>{fromLabel(r)}</span>
            <Svg d={ICONS.arrow} className="h-3.5 w-3.5 text-gray-400" />
            <span className="font-semibold text-gray-900">{toLabel(r)}</span>
            {specialty && <span>· {specialty}</span>}
            <span>· referred {longDate(r.referredDate)}</span>
          </p>
          {r.status === 'pending' && (
            <p className={`mt-1 text-sm ${waited > LATE_AFTER_DAYS ? 'font-semibold text-amber-800' : 'text-gray-500'}`}>
              Waiting for a reply <span className="font-mono">{waitedLabel(waited)}</span>
              {waited > LATE_AFTER_DAYS && r.urgency !== 'routine' && (r.escalationSentAt ? ' · the referring doctor was emailed about it' : ' · urgent referrals this old are emailed to the referring doctor')}
            </p>
          )}
        </div>

        <div className={`flex flex-wrap items-center gap-2 transition-opacity ${busy ? 'opacity-60' : ''}`}>
          {canPrint && (
            <a
              href={`/api/referrals/${r._id}/letter`}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.print} />
              Referral letter
            </a>
          )}
          {canPrint && <PdfLink href={`/api/referrals/${r._id}/letter`} label="referral letter" />}
          {canBook && (
            <Link
              href={`/appointments/new?patientId=${r.patient!._id}&doctorId=${r.receivingDoctor!._id}`}
              className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.calendar} />
              Book with {doctorName(r.receivingDoctor)}
            </Link>
          )}
          {canAct && r.status === 'pending' && (
            <SecondaryButton onClick={() => setDialog('decline')} disabled={busy} icon={ICONS.thumbDown}>
              {d === 'out' ? 'They declined' : 'Decline'}
            </SecondaryButton>
          )}
          {canAct && r.status === 'pending' && (
            <PrimaryButton
              onClick={() => step('accepted', d === 'out' ? 'Marked as accepted by the receiving doctor.' : 'Referral accepted.', 'The referral could not be accepted')}
              disabled={busy}
              icon={ICONS.check}
            >
              {d === 'out' ? 'They accepted' : 'Accept'}
            </PrimaryButton>
          )}
          {canAct && r.status === 'accepted' && (
            <PrimaryButton onClick={() => setDialog('seen')} disabled={busy} icon={ICONS.check}>
              Mark seen
            </PrimaryButton>
          )}
          {canAct && (
            <Link
              href={`/referrals/${r._id}/edit`}
              aria-label={`Edit the referral for ${who}`}
              title="Edit details"
              className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.pen} />
            </Link>
          )}
          {canAct && (
            <button
              type="button"
              onClick={() => setDialog('cancel')}
              disabled={busy}
              aria-label={`Cancel the referral for ${who}`}
              title="Cancel this referral"
              className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.x} />
            </button>
          )}
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {notice ?? ''}
      </p>
      {created && !notice && (
        <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <p>
            Referral saved{r.referralCode ? ` as ${r.referralCode}` : ''}. {canPrint ? 'Print the referral letter for the patient to take.' : 'It is waiting for a reply.'}
          </p>
          <button type="button" onClick={() => setCreated(false)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-green-700 hover:text-green-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-green-700 hover:text-green-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICONS.x} />
          </button>
        </div>
      )}

      {r.status === 'declined' && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Declined{r.declinedDate ? ` on ${shortDate(r.declinedDate)}` : ''}. {who} still needs a place.
            </p>
            {r.declinedReason && <p className="mt-0.5">“{r.declinedReason}”</p>}
            {permissions.canWrite && r.patient && (
              <Link href={`/referrals/new?patientId=${r.patient._id}`} className={`mt-1 inline-block rounded font-semibold underline underline-offset-2 hover:text-red-900 ${FOCUS_RING}`}>
                Refer {r.patient.firstName} somewhere else
              </Link>
            )}
          </div>
        </div>
      )}

      <div className={`grid items-start gap-6 transition-opacity duration-200 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] ${ref.loading ? 'opacity-60' : ''}`}>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel id="ref-why" title="Why">
            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-900">{r.reason}</p>
            </div>
            <dl className="divide-y divide-gray-100 border-t border-gray-100">
              <Field label="Urgency">{URGENCY_WORDS[r.urgency] ?? 'Routine'}</Field>
              {specialty && <Field label="Specialty">{specialty}</Field>}
              {r.notes && (
                <Field label="Notes">
                  <span className="whitespace-pre-wrap">{r.notes}</span>
                </Field>
              )}
            </dl>
          </Panel>

          {d !== 'patient' && (
            <Panel id="ref-clinical" title={sending ? 'For the receiving doctor' : 'From the referring doctor'}>
              {hasClinical ? (
                <dl className="divide-y divide-gray-100">
                  {r.chiefComplaint && <Field label="Complaint">{r.chiefComplaint}</Field>}
                  {r.diagnosis && <Field label="Diagnosis">{r.diagnosis}</Field>}
                  {r.relevantHistory && (
                    <Field label="History">
                      <span className="whitespace-pre-wrap">{r.relevantHistory}</span>
                    </Field>
                  )}
                  {(r.medications?.length ?? 0) > 0 && (
                    <Field label="Medicines">
                      <ul className="space-y-0.5">
                        {r.medications!.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </Field>
                  )}
                </dl>
              ) : (
                <p className="px-5 py-4 text-sm text-gray-500">
                  No clinical summary was written{sending ? '; the letter carries only the reason' : ''}.
                  {canAct && sending && (
                    <>
                      {' '}
                      <Link href={`/referrals/${r._id}/edit`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                        Add one
                      </Link>
                    </>
                  )}
                </p>
              )}
            </Panel>
          )}

          {(r.attachments?.length ?? 0) > 0 && (
            <Panel id="ref-files" title="Attachments">
              <ul className="divide-y divide-gray-100">
                {r.attachments!.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0 truncate text-gray-900">{a.filename}</span>
                    {safeUrl(a.url) ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className={`inline-flex shrink-0 items-center gap-1 rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                        Open
                        <Svg d={ICONS.link} className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="shrink-0 text-gray-500">Link not available</span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel id="ref-progress" title="Progress">
            <ol className="divide-y divide-gray-100">
              <Step done label="Referred" when={r.referredDate} />
              {r.status === 'declined' ? (
                <Step done tone="red" label="Declined" when={r.declinedDate} note={r.declinedReason} />
              ) : (
                <>
                  <Step done={Boolean(r.acceptedDate) || r.status === 'completed'} label="Accepted" when={r.acceptedDate} pending={cancelled ? 'Cancelled before a reply' : r.status === 'pending' ? 'Waiting for a reply' : undefined} />
                  <Step done={r.status === 'completed'} label="Seen" when={r.completedDate} pending={cancelled ? undefined : r.status === 'accepted' ? 'Not yet' : undefined} />
                </>
              )}
              {cancelled && <Step done tone="gray" label="Cancelled" when={r.updatedAt} />}
            </ol>
            {(r.appointment || scheduled || r.visit) && (
              <dl className="divide-y divide-gray-100 border-t border-gray-200">
                {(r.appointment || scheduled) && (
                  <Field label="Booked">
                    <BookingLine a={(r.appointment ?? scheduled)!} canOpen={permissions.canSeeAppointment} />
                    {!r.appointment && scheduled && <span className="block text-xs text-gray-500">Found in the schedule with {doctorName(r.receivingDoctor)}</span>}
                  </Field>
                )}
                {r.visit && (
                  <Field label="Seen at">
                    {permissions.canSeeVisit ? (
                      <Link href={`/visits/${r.visit._id}`} className={`rounded font-mono font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                        {r.visit.visitCode}
                      </Link>
                    ) : (
                      <span className="font-mono">{r.visit.visitCode}</span>
                    )}
                    <span className="text-gray-500"> · {shortDate(r.visit.date)}</span>
                  </Field>
                )}
              </dl>
            )}
          </Panel>

          <Panel id="ref-patient" title="Patient">
            {r.patient ? (
              <dl className="divide-y divide-gray-100">
                <Field label="Name">
                  {permissions.canSeePatient ? (
                    <Link href={`/patients/${r.patient._id}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {who}
                    </Link>
                  ) : (
                    who
                  )}
                  {r.patient.patientCode && <span className="ml-2 font-mono text-xs text-gray-500">{r.patient.patientCode}</span>}
                </Field>
                {r.patient.dateOfBirth && (
                  <Field label="Born">
                    <span className="font-mono">{birthDate(r.patient.dateOfBirth)}</span>
                    {ageFrom(r.patient.dateOfBirth) && <span className="text-gray-500"> · {ageFrom(r.patient.dateOfBirth)}</span>}
                  </Field>
                )}
                {r.patient.phone && (
                  <Field label="Phone">
                    <span className="font-mono">{r.patient.phone}</span>
                  </Field>
                )}
              </dl>
            ) : (
              <p className="px-5 py-4 text-sm text-gray-500">The patient record isn’t available at this clinic.</p>
            )}
          </Panel>

          <Panel id="ref-parties" title={DIRECTION_LABEL[d].label}>
            <dl className="divide-y divide-gray-100">
              <Field label="From">
                <Party r={r} side="from" canSeePatient={permissions.canSeePatient} />
              </Field>
              <Field label="To">
                <Party r={r} side="to" canSeePatient={permissions.canSeePatient} />
              </Field>
            </dl>
          </Panel>

          {r.followUpRequired && (
            <Panel id="ref-followup" title="Follow-up">
              <dl className="divide-y divide-gray-100">
                <Field label="Date">{r.followUpDate ? <span className="font-mono">{shortDate(r.followUpDate)}</span> : <span className="text-gray-500">Not set</span>}</Field>
                {r.followUpNotes && (
                  <Field label="Notes">
                    <span className="whitespace-pre-wrap">{r.followUpNotes}</span>
                  </Field>
                )}
                {r.followUpDate && (
                  <Field label="Reminder">
                    {r.followUpReminderSentAt ? (
                      <>
                        Sent to the patient <span className="font-mono">{shortDate(r.followUpReminderSentAt)}</span>
                      </>
                    ) : open ? (
                      <span className="text-gray-500">Goes to the patient 3 days before, if follow-up reminders are on</span>
                    ) : (
                      <span className="text-gray-500">Not sent</span>
                    )}
                  </Field>
                )}
              </dl>
            </Panel>
          )}

          {r.feedback && (r.feedback.rating || r.feedback.comments) && (
            <Panel id="ref-feedback" title="Feedback">
              <dl className="divide-y divide-gray-100">
                {r.feedback.rating && (
                  <Field label="Rating">
                    <span className="font-mono">{r.feedback.rating}</span> of 5
                  </Field>
                )}
                {r.feedback.comments && (
                  <Field label="Comments">
                    <span className="whitespace-pre-wrap">{r.feedback.comments}</span>
                  </Field>
                )}
                {r.feedback.submittedAt && (
                  <Field label="Given">
                    <span className="font-mono">{shortDate(r.feedback.submittedAt)}</span>
                  </Field>
                )}
              </dl>
            </Panel>
          )}
        </aside>
      </div>

      {dialog === 'decline' &&
        createPortal(
          <DeclineDialog
            referralId={r._id}
            who={who}
            outgoing={d === 'out'}
            onClose={() => setDialog(null)}
            onDone={() => done('Marked as declined. The reason stays on the referral.')}
          />,
          document.body
        )}
      {dialog === 'seen' &&
        createPortal(
          <SeenDialog
            referralId={r._id}
            patientId={r.patient?._id ?? null}
            who={who}
            referredDay={localKey(new Date(r.referredDate))}
            canPickVisit={permissions.canSeeVisit && d !== 'out'}
            onClose={() => setDialog(null)}
            onDone={() => done('Marked as seen. The referral is closed.')}
          />,
          document.body
        )}
      {dialog === 'cancel' &&
        createPortal(
          <CancelReferralDialog
            who={who}
            code={r.referralCode}
            busy={busy}
            onClose={() => setDialog(null)}
            onConfirm={() => step('cancelled', 'Referral cancelled. It stays on file.', 'The referral could not be cancelled')}
          />,
          document.body
        )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Step({ done, label, when, note, pending, tone }: { done: boolean; label: string; when?: string; note?: string; pending?: string; tone?: 'red' | 'gray' }) {
  if (!done && !pending) {
    return (
      <li className="flex items-start gap-3 px-5 py-3 text-sm">
        <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset ring-gray-300" />
        <span className="text-gray-500">{label}</span>
      </li>
    );
  }
  const dot = !done ? 'ring-1 ring-inset ring-gray-300' : tone === 'red' ? 'bg-red-600' : tone === 'gray' ? 'bg-gray-400' : 'bg-brand-teal-dark';
  return (
    <li className="flex items-start gap-3 px-5 py-3 text-sm">
      <span aria-hidden="true" className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="min-w-0 flex-1">
        <span className={done ? 'font-semibold text-gray-900' : 'text-gray-500'}>{label}</span>
        {done && when && (
          <span className="block font-mono text-xs text-gray-500">
            {shortDate(when)}, {clock(when)}
          </span>
        )}
        {!done && pending && <span className="block text-xs text-gray-500">{pending}</span>}
        {note && <span className="mt-0.5 block text-gray-700">“{note}”</span>}
      </span>
    </li>
  );
}

function BookingLine({ a, canOpen }: { a: NonNullable<Scheduled>; canOpen: boolean }) {
  const label = (
    <>
      <span className="font-mono">{shortDate(a.appointmentDate)}</span>
      {a.appointmentTime && <span className="font-mono">, {timeLabel(a.appointmentTime)}</span>}
    </>
  );
  return (
    <span>
      {canOpen ? (
        <Link href={`/appointments/${a._id}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
          {label}
        </Link>
      ) : (
        label
      )}
      {a.appointmentCode && <span className="ml-2 font-mono text-xs text-gray-500">{a.appointmentCode}</span>}
    </span>
  );
}

function Party({ r, side, canSeePatient }: { r: Referral; side: 'from' | 'to'; canSeePatient: boolean }) {
  const d = direction(r);
  if (side === 'from') {
    if (d === 'patient') {
      if (!r.referringPatient) return <span className="text-gray-500">A patient no longer on file</span>;
      return canSeePatient ? (
        <Link href={`/patients/${r.referringPatient._id}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
          {personName(r.referringPatient)}
        </Link>
      ) : (
        <>{personName(r.referringPatient)}</>
      );
    }
    if (d === 'in') {
      return (
        <>
          {r.referringClinic && <span className="block font-semibold">{r.referringClinic}</span>}
          {r.referringContact?.name && <span className="block">{r.referringContact.name}</span>}
          {r.referringContact?.phone && <span className="block font-mono text-gray-600">{r.referringContact.phone}</span>}
          {r.referringContact?.email && <span className="block break-all text-gray-600">{r.referringContact.email}</span>}
          {!r.referringClinic && !r.referringContact?.name && <span className="text-gray-500">Not recorded</span>}
        </>
      );
    }
    return r.referringDoctor ? (
      <>
        <span className="block font-semibold">{doctorName(r.referringDoctor)}</span>
        {specialtyOf(r.referringDoctor) && <span className="block text-gray-600">{specialtyOf(r.referringDoctor)}</span>}
      </>
    ) : (
      <span className="text-gray-500">This clinic (no doctor named)</span>
    );
  }
  if (r.receivingDoctor) {
    return (
      <>
        <span className="block font-semibold">{doctorName(r.receivingDoctor)}</span>
        {specialtyOf(r.receivingDoctor) && <span className="block text-gray-600">{specialtyOf(r.receivingDoctor)}</span>}
      </>
    );
  }
  if (r.receivingClinic) return <span className="font-semibold">{r.receivingClinic}</span>;
  return <span className="text-gray-500">{d === 'in' || d === 'patient' ? 'This clinic, no doctor named yet' : 'Not named'}</span>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/referrals" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
      <Svg d={ICONS.chevL} />
      All referrals
    </Link>
  );
}

function Panel({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <h2 id={id} className="text-base font-bold tracking-tight text-gray-900">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 px-5 py-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </div>
  );
}

function SecondaryButton({ onClick, disabled, icon, children }: { onClick: () => void; disabled?: boolean; icon: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait ${FOCUS_RING}`}
    >
      <Svg d={icon} />
      {children}
    </button>
  );
}

function PrimaryButton({ onClick, disabled, icon, children }: { onClick: () => void; disabled?: boolean; icon: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
    >
      <Svg d={icon} />
      {children}
    </button>
  );
}
