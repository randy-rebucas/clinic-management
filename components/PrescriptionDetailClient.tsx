'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertDialog } from './ui/Modal';
import { formatApiError } from './utils/apiError';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';
import { ageFrom, allergyList } from './visits/form/PatientSummary';
import { RX_STATE, medicineDirections, medicineForm, type RxStatus } from './prescriptions/shared';
import DispenseDialog from './prescriptions/DispenseDialog';
import { SERIES } from './dashboards/charts';
import { dispensedPerMedication, type DispenseItem } from '@/lib/prescription-dispense';
import type { PrescriptionDetailPermissions } from '@/lib/prescriptions-page';
import PdfLink from './documents/PdfLink';

type Allergy = string | { substance?: string; reaction?: string; severity?: string };

interface Medication {
  name: string;
  genericName?: string;
  form?: string;
  strength?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  quantity?: number;
  instructions?: string;
}

interface DispenseRecord {
  pharmacyName?: string;
  dispensedAt?: string;
  dispensedBy?: string;
  quantityDispensed?: number;
  items?: DispenseItem[];
  notes?: string;
  trackingNumber?: string;
}

interface Prescription {
  _id: string;
  prescriptionCode: string;
  patient: { _id: string; firstName: string; lastName: string; patientCode?: string; phone?: string; dateOfBirth?: string; allergies?: Allergy[] } | null;
  prescribedBy?: { _id: string; name: string } | null;
  visit?: { _id: string; visitCode: string; date: string; followUpDate?: string } | null;
  medications: Medication[];
  status: RxStatus;
  issuedAt: string;
  notes?: string;
  pharmacyDispenses?: DispenseRecord[];
  digitalSignature?: { providerName?: string; signatureData?: string; signedAt?: string };
  drugInteractions?: { medication1: string; medication2: string; severity: 'mild' | 'moderate' | 'severe' | 'contraindicated'; description: string; recommendation?: string }[];
  copies?: { patientCopy?: { printedAt?: string }; clinicCopy?: { archivedAt?: string } };
}

const ICONS = {
  ...ICON,
  print: 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z',
  pill: 'M10.5 20.5l10-10a4.95 4.95 0 10-7-7l-10 10a4.95 4.95 0 107 7zM8.5 8.5l7 7',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  stop: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
};

const INTERACTION: Record<string, { label: string; badge: string }> = {
  contraindicated: { label: 'Do not combine', badge: 'bg-red-50 text-red-800 ring-red-200' },
  severe: { label: 'Severe', badge: 'bg-red-50 text-red-800 ring-red-200' },
  moderate: { label: 'Moderate', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  mild: { label: 'Mild', badge: 'bg-gray-100 text-gray-700 ring-gray-200' },
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
/** Birth dates are stored at UTC midnight; read them in UTC so they never slip a day. */
const birthDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const isSevere = (s: string) => ['severe', 'high', 'life-threatening', 'anaphylaxis'].includes(s.toLowerCase());
const AUTO_NOTE = /^Generated automatically from visit /;

type Confirm = 'cancel' | 'complete' | null;

export default function PrescriptionDetailClient({ prescriptionId, permissions }: { prescriptionId: string; permissions: PrescriptionDetailPermissions }) {
  const router = useRouter();
  const rx = useKeyedFetch<Prescription>(`/api/prescriptions/${prescriptionId}`);
  const [dispensing, setDispensing] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; warnings: string[] } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // After any change the record is fetched again (the PUT and dispense answers carry less than this page shows).
  const p = rx.value;

  useEffect(() => {
    if (!notice || notice.warnings.length) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const setStatus = async (status: 'cancelled' | 'completed') => {
    setConfirm(null);
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setActionError(formatApiError(json, status === 'cancelled' ? 'The prescription could not be cancelled' : 'The prescription could not be closed'));
        return;
      }
      rx.reload();
      setNotice({ text: status === 'cancelled' ? 'Prescription cancelled. It stays on file and can no longer be dispensed or printed.' : 'Prescription closed. Nothing more will be dispensed on it.', warnings: [] });
    } catch {
      setActionError('The server couldn’t be reached. Nothing changed; try again.');
    } finally {
      setBusy(false);
    }
  };

  // --- Not loaded ----------------------------------------------------------------

  if (!p && rx.error) {
    const missing = /not found|invalid prescription id/i.test(rx.error);
    const denied = /permission|forbidden|not allowed/i.test(rx.error);
    return (
      <Shell>
        <BackLink />
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing || denied ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={missing || denied ? ICONS.doc : ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Prescription not found' : denied ? 'You can’t open this prescription' : 'This prescription didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {missing ? 'It may have been deleted, or it belongs to another clinic.' : denied ? 'Ask a clinic admin if you need access to prescriptions.' : `${rx.error}. Check your connection and try again.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/prescriptions" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All prescriptions
            </Link>
            {!missing && !denied && (
              <button type="button" onClick={rx.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!p) {
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
          Loading prescription…
        </span>
      </Shell>
    );
  }

  // --- Loaded --------------------------------------------------------------------

  const st = RX_STATE[p.status] ?? RX_STATE.active;
  const cancelled = p.status === 'cancelled';
  const open = p.status === 'active' || p.status === 'partially-dispensed';
  const who = p.patient ? `${p.patient.firstName} ${p.patient.lastName}`.trim() : 'Patient record unavailable';
  const meds = p.medications ?? [];
  const prescribed = meds.map((m) => Math.max(0, Number(m.quantity) || 0));
  const given = dispensedPerMedication(prescribed, p.pharmacyDispenses);
  const done = meds.filter((_, i) => (prescribed[i] > 0 ? given[i] >= prescribed[i] : given[i] > 0)).length;
  const allergies = allergyList(p.patient?.allergies);
  const refreshing = rx.loading;

  const printLink = (copy: 'patient' | 'clinic', label: string) => (
    <a
      href={`/api/prescriptions/${p._id}/print?copy=${copy}`}
      target="_blank"
      rel="noopener noreferrer"
      // Printing stamps the copy on the record; look again once it has.
      onClick={() => setTimeout(rx.reload, 3000)}
      className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
    >
      <Svg d={ICONS.print} />
      {label}
    </a>
  );

  return (
    <Shell>
      <BackLink />

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${cancelled ? 'text-gray-500 line-through decoration-gray-400 decoration-2' : 'text-gray-900'}`}>{who}</h1>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${st.badge}`}>{st.label}</span>
            <span className="font-mono text-sm text-gray-500">{p.prescriptionCode}</span>
          </div>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            Issued {longDate(p.issuedAt)} at <span className="font-mono">{clock(p.issuedAt)}</span> · {p.prescribedBy?.name ?? 'No prescriber recorded'}
            {p.visit && (
              <>
                {' · from visit '}
                {permissions.canSeeVisit ? (
                  <Link href={`/visits/${p.visit._id}`} className={`rounded font-mono font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                    {p.visit.visitCode}
                  </Link>
                ) : (
                  <span className="font-mono">{p.visit.visitCode}</span>
                )}
              </>
            )}
          </p>
          {/* Allergies first: whoever hands the medicines over should see them before anything else. */}
          {p.patient && (
            <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <span className="font-semibold text-gray-900">Allergies:</span>
              {allergies.length === 0 ? (
                <span className="text-gray-500">none on file</span>
              ) : (
                allergies.map((a, i) => (
                  <span key={i} className={isSevere(a.severity) ? 'font-semibold text-red-700' : 'text-gray-900'}>
                    {a.substance}
                    {(a.reaction || a.severity) && <span className={isSevere(a.severity) ? '' : 'text-gray-500'}> ({[a.reaction, a.severity?.toLowerCase()].filter(Boolean).join(', ')})</span>}
                    {i < allergies.length - 1 ? ',' : ''}
                  </span>
                ))
              )}
            </p>
          )}
        </div>

        <div className={`flex flex-wrap items-center gap-2 transition-opacity ${busy ? 'opacity-60' : ''}`}>
          {!cancelled && (
            <>
              {printLink('patient', 'Patient copy')}
              <PdfLink href={`/api/prescriptions/${p._id}/print?copy=patient`} label="patient copy" onClick={() => setTimeout(rx.reload, 3000)} />
              {printLink('clinic', 'Clinic copy')}
            </>
          )}
          {permissions.canUpdate && p.status === 'partially-dispensed' && (
            <button
              type="button"
              onClick={() => setConfirm('complete')}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 disabled:cursor-wait ${FOCUS_RING}`}
            >
              <Svg d={ICONS.check} />
              Close without the rest
            </button>
          )}
          {permissions.canUpdate && open && (
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setDispensing(true);
              }}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait ${FOCUS_RING}`}
            >
              <Svg d={ICONS.pill} />
              Dispense
            </button>
          )}
          {permissions.canUpdate && p.status === 'active' && (
            <button
              type="button"
              onClick={() => setConfirm('cancel')}
              disabled={busy}
              aria-label={`Cancel prescription ${p.prescriptionCode}`}
              title="Cancel prescription"
              className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.x} />
            </button>
          )}
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {notice?.text ?? ''}
      </p>
      {notice && (
        <div role="status" className={`motion-chip-in flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${notice.warnings.length ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
          <div>
            <p className="font-medium">{notice.text}</p>
            {notice.warnings.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {notice.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 opacity-80 hover:opacity-100 ${FOCUS_RING}`}>
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

      <div className={`grid items-start gap-6 transition-opacity duration-200 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] ${refreshing ? 'opacity-60' : ''}`}>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            id="rx-meds"
            title="Medicines"
            aside={
              meds.length > 0 && !cancelled ? (
                <span className="text-sm text-gray-500">
                  <span className="font-mono tabular-nums text-gray-900">{done}</span> of <span className="font-mono tabular-nums">{meds.length}</span> given
                </span>
              ) : null
            }
          >
            {meds.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">No medicines on this prescription.</p>
            ) : (
              <ol className="divide-y divide-gray-100">
                {meds.map((m, i) => (
                  <MedicineRow key={i} index={i} medicine={m} prescribed={prescribed[i]} given={given[i]} cancelled={cancelled} />
                ))}
              </ol>
            )}
          </Panel>

          {p.drugInteractions && p.drugInteractions.length > 0 && (
            <Panel id="rx-interactions" title="Interactions found when prescribed">
              <ul className="divide-y divide-gray-100">
                {p.drugInteractions.map((x, i) => {
                  const sev = INTERACTION[x.severity] ?? INTERACTION.mild;
                  return (
                    <li key={i} className="px-5 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-gray-900">
                          {x.medication1} <span className="font-normal text-gray-500">with</span> {x.medication2}
                        </p>
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${sev.badge}`}>{sev.label}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{x.description}</p>
                      {x.recommendation && <p className="mt-1 text-sm text-gray-500">{x.recommendation}</p>}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          {p.notes && !AUTO_NOTE.test(p.notes) && (
            <Panel id="rx-notes" title="Notes">
              <p className="max-w-prose whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-gray-700">{p.notes}</p>
            </Panel>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel id="rx-patient" title="Patient">
            {p.patient ? (
              <dl className="divide-y divide-gray-100">
                <Field label="Name">
                  {permissions.canSeePatient ? (
                    <Link href={`/patients/${p.patient._id}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                      {who}
                    </Link>
                  ) : (
                    who
                  )}
                  {p.patient.patientCode && <span className="ml-2 font-mono text-xs text-gray-500">{p.patient.patientCode}</span>}
                </Field>
                {p.patient.dateOfBirth && (
                  <Field label="Born">
                    <span className="font-mono">{birthDate(p.patient.dateOfBirth)}</span>
                    {ageFrom(p.patient.dateOfBirth) && <span className="text-gray-500"> · {ageFrom(p.patient.dateOfBirth)}</span>}
                  </Field>
                )}
                {p.patient.phone && (
                  <Field label="Phone">
                    <span className="font-mono">{p.patient.phone}</span>
                  </Field>
                )}
              </dl>
            ) : (
              <p className="px-5 py-4 text-sm text-gray-500">The patient record isn’t available at this clinic.</p>
            )}
          </Panel>

          <Panel id="rx-dispensed" title="Dispensed">
            {(p.pharmacyDispenses ?? []).length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-500">{cancelled ? 'Nothing was given before it was cancelled.' : 'Nothing given yet.'}</p>
            ) : (
              <ol className="divide-y divide-gray-100">
                {[...(p.pharmacyDispenses ?? [])].reverse().map((d, i) => (
                  <li key={i} className="px-5 py-3 text-sm">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold text-gray-900">{d.pharmacyName || 'At the clinic'}</span>
                      {d.dispensedAt && (
                        <span className="font-mono text-xs text-gray-500">
                          {shortDate(d.dispensedAt)}, {clock(d.dispensedAt)}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-gray-700">{dispenseSummary(d, meds)}</p>
                    {(d.dispensedBy || d.trackingNumber) && (
                      <p className="mt-0.5 text-gray-500">
                        {d.dispensedBy && `By ${d.dispensedBy}`}
                        {d.dispensedBy && d.trackingNumber && ' · '}
                        {d.trackingNumber && <span className="font-mono text-xs">Ref {d.trackingNumber}</span>}
                      </p>
                    )}
                    {d.notes && <p className="mt-1 whitespace-pre-wrap text-gray-600">{d.notes}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel id="rx-signature" title="Signature">
            {p.digitalSignature?.signatureData ? (
              <div className="px-5 py-4">
                <div className="rounded-md border border-gray-200 bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signature stored inline as a data URL */}
                  <img src={p.digitalSignature.signatureData} alt={`Signature of ${p.digitalSignature.providerName ?? 'the prescriber'}`} className="mx-auto block h-16 max-w-full object-contain" />
                </div>
                {p.digitalSignature.providerName && <p className="mt-3 text-sm font-semibold text-gray-900">{p.digitalSignature.providerName}</p>}
                {p.digitalSignature.signedAt && (
                  <p className="text-sm text-gray-500">
                    Signed <span className="font-mono">{shortDate(p.digitalSignature.signedAt)}, {clock(p.digitalSignature.signedAt)}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="px-5 py-4 text-sm text-gray-500">Not signed. The printout has a blank signature line.</p>
            )}
          </Panel>

          {(p.copies?.patientCopy?.printedAt || p.copies?.clinicCopy?.archivedAt) && (
            <Panel id="rx-copies" title="Printed">
              <dl className="divide-y divide-gray-100">
                {p.copies?.patientCopy?.printedAt && (
                  <Field label="Patient copy">
                    <span className="font-mono">
                      {shortDate(p.copies.patientCopy.printedAt)}, {clock(p.copies.patientCopy.printedAt)}
                    </span>
                  </Field>
                )}
                {p.copies?.clinicCopy?.archivedAt && (
                  <Field label="Clinic copy">
                    <span className="font-mono">
                      {shortDate(p.copies.clinicCopy.archivedAt)}, {clock(p.copies.clinicCopy.archivedAt)}
                    </span>
                  </Field>
                )}
              </dl>
            </Panel>
          )}
        </aside>
      </div>

      {dispensing && (
        <DispenseDialog
          prescriptionId={p._id}
          medications={meds}
          given={given}
          onClose={() => setDispensing(false)}
          onDone={(warnings) => {
            setDispensing(false);
            rx.reload();
            setNotice({ text: warnings.length ? 'Dispense recorded, with a stock note:' : 'Dispense recorded.', warnings });
          }}
        />
      )}

      {confirm &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && setConfirm(null)}
            title={confirm === 'cancel' ? 'Cancel this prescription?' : 'Close it without the rest?'}
            description={
              confirm === 'cancel'
                ? `${who}, ${p.prescriptionCode}. It stays on file marked cancelled, and it can no longer be dispensed or printed. Write a new prescription if the patient still needs medicines.`
                : `${who}, ${p.prescriptionCode}. What was given stays recorded; the medicines still to give won't be dispensed on this prescription.`
            }
          >
            <button type="button" onClick={() => setConfirm(null)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              {confirm === 'cancel' ? 'Keep prescription' : 'Not yet'}
            </button>
            {confirm === 'cancel' ? (
              <button type="button" onClick={() => setStatus('cancelled')} className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}>
                Cancel prescription
              </button>
            ) : (
              <button type="button" onClick={() => setStatus('completed')} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Close prescription
              </button>
            )}
          </AlertDialog>,
          document.body
        )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function BackLink() {
  return (
    <Link href="/prescriptions" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
      <Svg d={ICONS.chevL} />
      All prescriptions
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

/**
 * One medicine: what it is, how to take it, and how much of it has been handed over. The meter
 * is the only figure the dispenser needs from the row, so it sits at the right in Chart Teal.
 */
function MedicineRow({ index, medicine: m, prescribed, given, cancelled }: { index: number; medicine: Medication; prescribed: number; given: number; cancelled: boolean }) {
  const form = medicineForm(m);
  const directions = medicineDirections(m);
  const share = prescribed > 0 ? Math.min(1, given / prescribed) : given > 0 ? 1 : 0;
  const state =
    prescribed > 0 ? (given >= prescribed ? `All ${prescribed} given` : given > 0 ? `${given} of ${prescribed} given` : `${prescribed} to give`) : given > 0 ? `${given} given` : 'No quantity set';
  return (
    <li className="motion-row-in grid gap-3 px-5 py-4 sm:grid-cols-[1.5rem_minmax(0,1fr)_9rem]" style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}>
      <span className="hidden pt-0.5 font-mono text-sm text-gray-400 sm:block">{index + 1}</span>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900">
          {m.name}
          {m.genericName && m.genericName !== m.name && <span className="font-normal text-gray-500"> ({m.genericName})</span>}
        </p>
        {form && <p className="text-sm text-gray-500">{form}</p>}
        {directions && <p className="mt-1 text-sm text-gray-900">{directions}</p>}
        {m.instructions && m.instructions !== directions && <p className="mt-0.5 max-w-prose text-sm text-gray-600">{m.instructions}</p>}
      </div>
      {!cancelled && (
        <div className="sm:pt-1 sm:text-right">
          <p className="text-sm text-gray-700">
            <span className="font-mono tabular-nums">{state}</span>
          </p>
          {(prescribed > 0 || given > 0) && (
            <div
              role="meter"
              aria-label={`${m.name}: ${state}`}
              aria-valuemin={0}
              aria-valuemax={prescribed || 1}
              aria-valuenow={prescribed ? Math.min(given, prescribed) : given > 0 ? 1 : 0}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100"
            >
              <div className="motion-bar-grow h-full rounded-full" style={{ width: `${share * 100}%`, background: SERIES.teal }} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function dispenseSummary(d: DispenseRecord, meds: Medication[]) {
  if (Array.isArray(d.items) && d.items.length) {
    return d.items.map((it) => `${meds[it.medicationIndex]?.name ?? 'Medicine'} × ${it.quantity}`).join(', ');
  }
  return d.quantityDispensed ? `${d.quantityDispensed} in total` : 'Quantity not recorded';
}
