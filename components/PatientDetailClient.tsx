'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import MessagePatientButton from './patients/MessagePatientButton';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AlertDialog, Modal } from './ui/Modal';
import { useSetting } from './SettingsContext';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { StatusBadge } from './dashboards/shared';
import { FIELD, FOCUS_RING, ICON, Svg, dayLabel, localKey, timeLabel } from './appointments/shared';
import { STATUS_BADGE as VISIT_BADGE, STATUS_LABEL as VISIT_LABEL, visitTypeLabel, type VisitStatus } from './visits/shared';
import VitalsPanel, { type VitalsReading } from './visits/VitalsPanel';
import { ageFrom, allergyList } from './visits/form/PatientSummary';
import AttachForm from './records/AttachForm';
import { INVOICE_LABEL, LAB_LABEL, RX_LABEL, fileSize, money } from './records/labels';
import { formatApiError } from './utils/apiError';
import PatientSearch, { type PatientOption } from './patients/PatientSearch';
import type { PatientRecordPermissions } from '@/lib/patient-record-page';

const QRCode = dynamic(() => import('react-qr-code'), { ssr: false });

// ---------------------------------------------------------------------------
// Shape of /api/patients/[id]/record
// ---------------------------------------------------------------------------

type Allergy = string | { substance?: string; reaction?: string; severity?: string };

interface Patient {
  _id: string;
  patientCode?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  sex?: 'male' | 'female' | 'other' | 'unknown';
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  address?: { street?: string; city?: string; state?: string; zipCode?: string };
  emergencyContact?: { name?: string; phone?: string; relationship?: string };
  identifiers?: { philHealth?: string; govId?: string };
  medicalHistory?: string;
  preExistingConditions?: { condition: string; diagnosisDate?: string; status?: 'active' | 'resolved' | 'chronic'; notes?: string }[];
  allergies?: Allergy[];
  familyHistory?: Record<string, string>;
  attachments: { _id: string; filename?: string; contentType?: string; size?: number; uploadDate?: string; notes?: string }[];
  createdAt?: string;
}

interface VisitItem {
  _id: string;
  visitCode: string;
  date: string;
  visitType: string;
  chiefComplaint?: string;
  diagnoses?: { code?: string; description?: string; primary?: boolean }[];
  status: VisitStatus;
  provider?: { name?: string } | null;
}
interface AppointmentItem {
  _id: string;
  appointmentCode?: string;
  appointmentDate: string;
  appointmentTime?: string;
  status: string;
  reason?: string;
  isWalkIn?: boolean;
  doctor?: { firstName?: string; lastName?: string } | null;
}
interface RxItem {
  _id: string;
  prescriptionCode: string;
  issuedAt: string;
  status: string;
  medications?: { name: string }[];
}
interface LabItem {
  _id: string;
  requestCode?: string;
  orderDate: string;
  resultDate?: string;
  status: string;
  request?: { testType?: string; urgency?: string };
}
interface InvoiceItem {
  _id: string;
  invoiceNumber: string;
  createdAt: string;
  status: string;
  total?: number;
  totalPaid?: number;
  outstandingBalance?: number;
}

interface PatientRecord {
  patient: Patient;
  visits: { items: VisitItem[]; total: number; vitals: VitalsReading[] } | null;
  appointments: { items: AppointmentItem[]; total: number; next: AppointmentItem | null } | null;
  prescriptions: { items: RxItem[]; total: number; waiting: number } | null;
  labs: { items: LabItem[]; total: number; atLab: number; toReview: number } | null;
  billing: { items: InvoiceItem[]; total: number; billed: number; paid: number; outstanding: number; unpaidCount: number } | null;
  missing: string[];
}

type TabKey = 'all' | 'visits' | 'appointments' | 'prescriptions' | 'labs' | 'invoices' | 'files';

const ICONS = {
  ...ICON,
  qr: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z',
  pen: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  plus: 'M12 4v16m8-8H4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  download: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  external: 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  key: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
};

const has = (s?: string | null) => typeof s === 'string' && s.trim() !== '';
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
/** Date-only fields (birth dates) are stored at UTC midnight; read them in UTC so they never slip a day. */
const calendarDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const isSevere = (s?: string) => ['severe', 'high', 'life-threatening', 'anaphylaxis'].includes((s ?? '').toLowerCase());
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const doctorOf = (a: AppointmentItem) => (a.doctor?.lastName ? `Dr. ${a.doctor.firstName ?? ''} ${a.doctor.lastName}`.replace(/\s+/g, ' ') : null);
const apptDay = (a: AppointmentItem) => dayLabel(localKey(new Date(a.appointmentDate)), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const primaryDx = (v: VisitItem) => v.diagnoses?.find((d) => d.primary) ?? v.diagnoses?.[0];

export default function PatientDetailClient({ patientId, permissions }: { patientId: string; permissions: PatientRecordPermissions }) {
  const currency = useSetting('billingSettings.currency', 'PHP') as string;
  const record = useKeyedFetch<PatientRecord>(`/api/patients/${patientId}/record`);
  const [tab, setTab] = useState<TabKey>('all');
  const [showQr, setShowQr] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Patient['attachments'][number] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const data = record.value;

  // --- Not loaded -------------------------------------------------------------

  if (!data && record.error) {
    const missing = /not found/i.test(record.error);
    const denied = /permission/i.test(record.error);
    return (
      <Shell>
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-14 text-center">
          <div className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md ${missing || denied ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={ICONS.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{missing ? 'Patient not found' : denied ? 'You can’t open this patient' : 'This patient’s record didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {missing ? 'The record may have been removed, or it belongs to another clinic.' : denied ? 'Your role doesn’t include reading patient records.' : `${record.error}. Check your connection and try again.`}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/patients" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All patients
            </Link>
            {!missing && !denied && (
              <button type="button" onClick={record.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="space-y-2">
            <div className="h-8 w-72 rounded bg-gray-200" />
            <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
          </div>
          <div className="h-28 rounded-lg border border-gray-200 bg-white" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-96 rounded-lg border border-gray-200 bg-white" />
            <div className="h-72 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
        <span className="sr-only" role="status">
          Loading the patient’s record…
        </span>
      </Shell>
    );
  }

  // --- Loaded -----------------------------------------------------------------

  const p = data.patient;
  const fullName = [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ');
  const age = ageFrom(p.dateOfBirth);
  const allergies = allergyList(p.allergies);
  const refreshing = record.loading;

  const upload = async (file: File, notes: string) => {
    setActionError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      if (notes) body.append('notes', notes);
      const res = await fetch(`/api/patients/${patientId}/upload`, { method: 'POST', body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setActionError(formatApiError(json, `${file.name} could not be attached`));
        return false;
      }
      setNotice(`${file.name} is attached to ${p.firstName}’s record.`);
      record.reload();
      return true;
    } catch {
      setActionError(`${file.name} could not be attached. Check your connection and try again.`);
      return false;
    }
  };

  const removeFile = async () => {
    if (!removing) return;
    const f = removing;
    setRemoving(null);
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/files/${f._id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'The file could not be removed'));
      setNotice(`${f.filename ?? 'The file'} was removed.`);
      record.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The file could not be removed');
    } finally {
      setBusy(false);
    }
  };

  const more: { label: string; href?: string; onClick?: () => void }[] = [
    ...(permissions.canOrderLab ? [{ label: 'Order a lab test', href: `/lab-results/new?patientId=${patientId}` }] : []),
    ...(permissions.canInvoice ? [{ label: 'New invoice', href: `/invoices/new?patientId=${patientId}` }] : []),
    { label: 'Show the patient’s QR code', onClick: () => setShowQr(true) },
  ];

  return (
    <Shell>
      <Link href="/patients" className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
        <Svg d={ICONS.chevL} />
        All patients
      </Link>

      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{fullName}</h1>
            {p.patientCode && <span className="font-mono text-sm text-gray-500">{p.patientCode}</span>}
          </div>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            {[
              age,
              p.sex && p.sex !== 'unknown' ? titleCase(p.sex) : null,
              p.dateOfBirth ? `born ${calendarDate(p.dateOfBirth)}` : 'birth date not on file',
              p.createdAt ? `registered ${shortDate(p.createdAt)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {/* Allergies stay in sight wherever the page is opened. */}
          <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 text-sm">
            <span className="font-semibold text-gray-900">Allergies:</span>
            {allergies.length === 0 ? (
              <span className="text-gray-500">none on file{permissions.canEdit ? ', ask and record them' : ''}</span>
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.canEdit && (
            <Link
              href={`/patients/${patientId}/edit`}
              className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.pen} />
              Edit details
            </Link>
          )}
          {permissions.canBook && (
            <Link
              href={`/appointments/new?patientId=${patientId}`}
              className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 transition-colors hover:border-brand-teal-dark hover:bg-brand-teal-light/50 hover:text-brand-teal-deep ${FOCUS_RING}`}
            >
              <Svg d={ICONS.calendar} />
              Book appointment
            </Link>
          )}
          {permissions.canStartVisit && (
            <Link
              href={`/visits/new?patientId=${patientId}`}
              className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep ${FOCUS_RING}`}
            >
              <Svg d={ICONS.plus} />
              New visit
            </Link>
          )}
          {permissions.canMessage && <MessagePatientButton patientId={patientId} patientName={p.firstName} />}
          <MoreMenu items={more} />
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        {notice ?? ''}
      </p>
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

      <div className={`flex flex-col gap-6 transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
        <SummaryStrip data={data} currency={currency} canBook={permissions.canBook} patientId={patientId} />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {data.visits && data.visits.vitals.length > 0 && <VitalsPanel mode="patient" history={data.visits.vitals} />}
            <RecordTabs
              data={data}
              tab={tab}
              onTab={setTab}
              currency={currency}
              files={
                <FilesList
                  patientId={patientId}
                  files={p.attachments}
                  canEdit={permissions.canEdit}
                  busy={busy}
                  onRemove={setRemoving}
                  attach={permissions.canEdit ? <AttachForm onUpload={upload} noun="patient record" placeholder="Outside lab result, March 2026" /> : null}
                />
              }
            />
          </div>
          <aside className="flex min-w-0 flex-col gap-6">
            <ClinicalPanel patient={p} allergies={allergies} />
            <DetailsPanel patient={p} missing={data.missing} canEdit={permissions.canEdit} patientId={patientId} />
            {data.billing && <BillingPanel billing={data.billing} currency={currency} canInvoice={permissions.canInvoice} patientId={patientId} />}
            {permissions.canSetAppAccess && <AppAccessPanel patientId={patientId} fallbackEmail={p.email} firstName={p.firstName} />}
            {permissions.canSetAppAccess && <FamilyAccessPanel patientId={patientId} firstName={p.firstName} />}
          </aside>
        </div>
      </div>

      <Modal open={showQr} onOpenChange={setShowQr} className="max-w-sm" labelledBy="patient-qr-title">
        <div className="p-6 text-center">
          <h2 id="patient-qr-title" className="text-lg font-bold tracking-tight text-gray-900">
            {fullName}
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">Scan to look up this patient. It can’t be used to sign in to the patient app.</p>
          <div className="mx-auto mt-5 w-fit rounded-lg border border-gray-200 bg-white p-4">
            <QRCode value={p.patientCode || p._id} size={208} />
          </div>
          <p className="mt-3 font-mono text-sm text-gray-900">{p.patientCode || p._id}</p>
          <button type="button" onClick={() => setShowQr(false)} className={`mt-5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
            Close
          </button>
        </div>
      </Modal>

      {removing &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(open) => !open && setRemoving(null)}
            title="Remove this file?"
            description={`${removing.filename ?? 'This file'} is deleted from ${p.firstName}’s record for good. Download it first if you need a copy.`}
          >
            <button type="button" onClick={() => setRemoving(null)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Keep it
            </button>
            <button type="button" onClick={removeFile} className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 ${FOCUS_RING}`}>
              Remove file
            </button>
          </AlertDialog>,
          document.body
        )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Panel({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="motion-panel-in rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby={id}>
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
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 px-5 py-2.5 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words text-gray-900">{children}</dd>
    </div>
  );
}

const NotOnFile = () => <span className="text-gray-400">Not on file</span>;

function MoreMenu({ items }: { items: { label: string; href?: string; onClick?: () => void }[] }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass = 'block w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal';
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`${ids}-menu`}
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-md border border-gray-300 bg-white p-2 text-gray-700 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
      >
        <Svg d={ICONS.more} />
      </button>
      {open && (
        <ul id={`${ids}-menu`} className="motion-panel-in absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-[0_8px_30px_rgb(15,23,42,0.1)]">
          {items.map((it) => (
            <li key={it.label}>
              {it.href ? (
                <Link href={it.href} className={itemClass} onClick={() => setOpen(false)}>
                  {it.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className={itemClass}
                  onClick={() => {
                    setOpen(false);
                    it.onClick?.();
                  }}
                >
                  {it.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary: the four things a front desk or doctor asks first
// ---------------------------------------------------------------------------

function SummaryStrip({ data, currency, canBook, patientId }: { data: PatientRecord; currency: string; canBook: boolean; patientId: string }) {
  const cells: ReactNode[] = [];
  const cell = 'border-r border-b border-gray-200 p-5';

  if (data.visits) {
    const last = data.visits.items.find((v) => v.status !== 'cancelled' && v.status !== 'draft');
    const dx = last ? primaryDx(last) : null;
    cells.push(
      <div key="visit" className={cell}>
        <p className="text-sm text-gray-600">Last visit</p>
        {last ? (
          <>
            <Link href={`/visits/${last._id}`} className={`mt-1.5 block w-fit rounded font-mono text-lg font-semibold tabular-nums text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
              {shortDate(last.date)}
            </Link>
            <p className="mt-0.5 truncate text-sm text-gray-500">{dx ? [dx.code, dx.description].filter(Boolean).join(' ') : last.chiefComplaint || visitTypeLabel(last.visitType)}</p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-gray-500">No visits yet</p>
        )}
      </div>
    );
  }

  if (data.appointments) {
    const next = data.appointments.next;
    cells.push(
      <div key="next" className={cell}>
        <p className="text-sm text-gray-600">Next appointment</p>
        {next ? (
          <>
            <Link href={`/appointments/${next._id}`} className={`mt-1.5 block w-fit rounded font-mono text-lg font-semibold tabular-nums text-gray-900 hover:text-brand-teal-deep ${FOCUS_RING}`}>
              {apptDay(next).replace(/^\w+, /, '')}
            </Link>
            <p className="mt-0.5 truncate text-sm text-gray-500">
              <span className="font-mono">{timeLabel(next.appointmentTime)}</span>
              {doctorOf(next) ? ` · ${doctorOf(next)}` : ''}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-sm text-gray-500">
            None booked
            {canBook && (
              <>
                {' · '}
                <Link href={`/appointments/new?patientId=${patientId}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
                  Book one
                </Link>
              </>
            )}
          </p>
        )}
      </div>
    );
  }

  if (data.labs) {
    const { atLab, toReview } = data.labs;
    cells.push(
      <div key="labs" className={cell}>
        <p className="text-sm text-gray-600">Lab tests</p>
        <p className={`mt-1.5 font-mono text-lg font-semibold tabular-nums ${toReview + atLab > 0 ? 'text-gray-900' : 'text-gray-500'}`}>{toReview + atLab}</p>
        <p className="mt-0.5 text-sm text-gray-500">
          {toReview + atLab === 0 ? 'Nothing outstanding' : [toReview && `${toReview} result${toReview === 1 ? '' : 's'} to review`, atLab && `${atLab} at the lab`].filter(Boolean).join(', ')}
        </p>
      </div>
    );
  }

  if (data.billing) {
    const owed = data.billing.outstanding > 0;
    cells.push(
      <div key="bill" className={cell}>
        <p className="text-sm text-gray-600">Balance due</p>
        <p className={`mt-1.5 font-mono text-lg font-semibold tabular-nums ${owed ? 'text-red-700' : 'text-gray-500'}`}>{money(data.billing.outstanding, currency)}</p>
        <p className={`mt-0.5 text-sm ${owed ? 'text-red-700' : 'text-gray-500'}`}>
          {owed ? `on ${data.billing.unpaidCount} unpaid invoice${data.billing.unpaidCount === 1 ? '' : 's'}` : 'Nothing owed'}
        </p>
      </div>
    );
  }

  if (cells.length === 0) return null;
  const cols = cells.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : cells.length === 3 ? 'sm:grid-cols-3' : cells.length === 2 ? 'sm:grid-cols-2' : '';
  return (
    <div className="motion-panel-in rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className={`grid -mr-px -mb-px grid-cols-1 ${cols}`}>{cells}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The record: everything, or one kind at a time
// ---------------------------------------------------------------------------

interface Row {
  key: string;
  date: string;
  href?: string;
  kind: string;
  title: ReactNode;
  sub?: ReactNode;
  state?: ReactNode;
  struck?: boolean;
}

function rowsFor(data: PatientRecord, currency: string) {
  const visits: Row[] = (data.visits?.items ?? []).map((v) => {
    const dx = primaryDx(v);
    return {
      key: `v${v._id}`,
      date: v.date,
      href: `/visits/${v._id}`,
      kind: 'Visit',
      title: dx ? (
        <>
          {dx.code && <span className="mr-1.5 font-mono text-xs font-semibold">{dx.code}</span>}
          {dx.description}
        </>
      ) : (
        v.chiefComplaint || visitTypeLabel(v.visitType)
      ),
      sub: [visitTypeLabel(v.visitType), v.provider?.name, v.visitCode].filter(Boolean).join(' · '),
      state: <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${VISIT_BADGE[v.status] ?? VISIT_BADGE.open}`}>{VISIT_LABEL[v.status] ?? v.status}</span>,
      struck: v.status === 'cancelled',
    };
  });
  const appointments: Row[] = (data.appointments?.items ?? []).map((a) => ({
    key: `a${a._id}`,
    date: a.appointmentDate,
    href: `/appointments/${a._id}`,
    kind: 'Appointment',
    title: (
      <>
        <span className="font-mono">{timeLabel(a.appointmentTime)}</span>
        {doctorOf(a) ? ` with ${doctorOf(a)}` : ''}
        {a.isWalkIn ? ' · walk-in' : ''}
      </>
    ),
    sub: a.reason || a.appointmentCode,
    state: <StatusBadge status={a.status} />,
    struck: a.status === 'cancelled',
  }));
  const prescriptions: Row[] = (data.prescriptions?.items ?? []).map((rx) => ({
    key: `p${rx._id}`,
    date: rx.issuedAt,
    href: `/prescriptions/${rx._id}`,
    kind: 'Prescription',
    title: (rx.medications ?? []).map((m) => m.name).filter(Boolean).join(', ') || 'No medicines listed',
    sub: rx.prescriptionCode,
    state: <span className="text-xs font-medium text-gray-600">{RX_LABEL[rx.status] ?? rx.status}</span>,
    struck: rx.status === 'cancelled',
  }));
  const labs: Row[] = (data.labs?.items ?? []).map((l) => ({
    key: `l${l._id}`,
    date: l.orderDate,
    href: `/lab-results/${l._id}`,
    kind: 'Lab test',
    title: (
      <>
        {l.request?.testType || 'Lab test'}
        {l.request?.urgency && l.request.urgency !== 'routine' && <span className="ml-1.5 text-xs font-semibold text-amber-800">{l.request.urgency === 'stat' ? 'STAT' : 'Urgent'}</span>}
      </>
    ),
    sub: [l.requestCode, l.resultDate ? `result ${shortDate(l.resultDate)}` : null].filter(Boolean).join(' · '),
    state: <span className={`text-xs font-medium ${l.status === 'completed' ? 'text-gray-900' : 'text-gray-600'}`}>{LAB_LABEL[l.status] ?? l.status}</span>,
    struck: l.status === 'cancelled',
  }));
  const invoices: Row[] = (data.billing?.items ?? []).map((inv) => {
    const due = (inv.status === 'unpaid' || inv.status === 'partial') && (inv.outstandingBalance ?? 0) > 0;
    return {
      key: `i${inv._id}`,
      date: inv.createdAt,
      href: `/invoices/${inv._id}`,
      kind: 'Invoice',
      title: <span className="font-mono">{money(inv.total ?? 0, currency)}</span>,
      sub: inv.invoiceNumber,
      state: (
        <span className={`text-xs font-medium ${due ? 'text-red-700' : 'text-gray-600'}`}>
          {INVOICE_LABEL[inv.status] ?? inv.status}
          {due && <span className="font-mono"> · {money(inv.outstandingBalance ?? 0, currency)} due</span>}
        </span>
      ),
    };
  });
  return { visits, appointments, prescriptions, labs, invoices };
}

function RecordTabs({ data, tab, onTab, currency, files }: { data: PatientRecord; tab: TabKey; onTab: (t: TabKey) => void; currency: string; files: ReactNode }) {
  const ids = useId();
  const rows = rowsFor(data, currency);
  const tabs: { key: TabKey; label: string; count: number | null; total?: number }[] = [
    { key: 'all', label: 'Everything', count: null },
    ...(data.visits ? [{ key: 'visits' as const, label: 'Visits', count: data.visits.total, total: data.visits.total }] : []),
    ...(data.appointments ? [{ key: 'appointments' as const, label: 'Appointments', count: data.appointments.total, total: data.appointments.total }] : []),
    ...(data.prescriptions ? [{ key: 'prescriptions' as const, label: 'Prescriptions', count: data.prescriptions.total, total: data.prescriptions.total }] : []),
    ...(data.labs ? [{ key: 'labs' as const, label: 'Lab tests', count: data.labs.total, total: data.labs.total }] : []),
    ...(data.billing ? [{ key: 'invoices' as const, label: 'Invoices', count: data.billing.total, total: data.billing.total }] : []),
    { key: 'files', label: 'Files', count: data.patient.attachments.length },
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'all';
  const index = tabs.findIndex((t) => t.key === active);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = e.key === 'ArrowRight' ? index + 1 : e.key === 'ArrowLeft' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length];
    onTab(t.key);
    requestAnimationFrame(() => document.getElementById(`${ids}-tab-${t.key}`)?.focus());
  };

  let list: Row[] = [];
  let shownOf: { shown: number; total: number } | null = null;
  if (active === 'all') {
    list = [...rows.visits, ...rows.appointments, ...rows.prescriptions, ...rows.labs, ...rows.invoices]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30);
  } else if (active !== 'files') {
    list = rows[active];
    const t = tabs[index];
    if (t.total !== undefined && t.total > list.length) shownOf = { shown: list.length, total: t.total };
  }

  const empty: Record<Exclude<TabKey, 'files'>, string> = {
    all: 'Nothing on record yet. Visits, appointments, prescriptions, lab tests and invoices appear here as they happen.',
    visits: 'No visits yet.',
    appointments: 'No appointments yet.',
    prescriptions: 'No prescriptions yet. They are made from the medicines in a visit note.',
    labs: 'No lab tests ordered yet.',
    invoices: 'No invoices yet. One is made when a visit is closed.',
  };

  return (
    <section className="motion-panel-in rounded-lg border border-gray-200 bg-white overflow-hidden" aria-labelledby={`${ids}-title`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-4">
        <h2 id={`${ids}-title`} className="text-base font-bold tracking-tight text-gray-900">
          Record
        </h2>
      </div>
      <div role="tablist" aria-label="What to show" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-gray-200 px-3 pt-2">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              id={`${ids}-tab-${t.key}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`${ids}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => onTab(t.key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal ${
                on ? 'border-brand-teal-dark text-gray-900' : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {t.label}
              {t.count !== null && <span className={`ml-1.5 font-mono text-xs ${on ? 'text-gray-700' : 'text-gray-500'}`}>{t.count.toLocaleString('en-US')}</span>}
            </button>
          );
        })}
      </div>
      <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${active}`}>
        {active === 'files' ? (
          files
        ) : list.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">{empty[active]}</p>
        ) : (
          <>
            <ul key={active} className="divide-y divide-gray-100">
              {list.map((r, i) => (
                <li key={r.key} className="motion-row-in" style={{ animationDelay: `${Math.min(i * 18, 220)}ms` }}>
                  <RecordRow row={r} showKind={active === 'all'} />
                </li>
              ))}
            </ul>
            {shownOf && (
              <p className="border-t border-gray-100 px-5 py-2.5 text-sm text-gray-500">
                Newest <span className="font-mono text-gray-900">{shownOf.shown}</span> of <span className="font-mono text-gray-900">{shownOf.total.toLocaleString('en-US')}</span>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function RecordRow({ row: r, showKind }: { row: Row; showKind: boolean }) {
  const body = (
    <>
      <span className="font-mono text-sm tabular-nums text-gray-900 sm:w-28 sm:shrink-0">{shortDate(r.date)}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${r.struck ? 'text-gray-500 line-through decoration-gray-400' : 'text-gray-900'}`}>
          {showKind && <span className="mr-2 text-xs font-medium text-gray-500">{r.kind}</span>}
          {r.title}
        </span>
        {r.sub && <span className="block truncate text-sm text-gray-500">{r.sub}</span>}
      </span>
      {r.state && <span className="shrink-0 sm:text-right">{r.state}</span>}
    </>
  );
  const cls = 'flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4';
  return r.href ? (
    <Link href={r.href} className={`${cls} transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function FilesList({
  patientId,
  files,
  canEdit,
  busy,
  onRemove,
  attach,
}: {
  patientId: string;
  files: Patient['attachments'];
  canEdit: boolean;
  busy: boolean;
  onRemove: (f: Patient['attachments'][number]) => void;
  attach: ReactNode;
}) {
  const sorted = [...files].sort((a, b) => new Date(b.uploadDate ?? 0).getTime() - new Date(a.uploadDate ?? 0).getTime());
  return (
    <>
      {sorted.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500">No files yet{canEdit ? '. Attach outside results, referral letters or ID scans below.' : '.'}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sorted.map((f, i) => {
            const url = `/api/patients/${patientId}/files/${f._id}`;
            const name = f.filename || 'Untitled file';
            return (
              <li key={f._id} className="motion-row-in flex items-center gap-4 px-5 py-3" style={{ animationDelay: `${Math.min(i * 18, 220)}ms` }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500" aria-hidden="true">
                  <Svg d={ICONS.doc} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900" title={name}>
                    {name}
                  </span>
                  <span className="block truncate text-sm text-gray-500">
                    <span className="font-mono text-xs">
                      {f.uploadDate ? shortDate(f.uploadDate) : 'Date unknown'}
                      {f.size ? ` · ${fileSize(f.size)}` : ''}
                    </span>
                    {has(f.notes) && <> · {f.notes}</>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${name}`} title="Open in a new tab" className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep ${FOCUS_RING}`}>
                    <Svg d={ICONS.external} />
                  </a>
                  <a href={`${url}?download=1`} aria-label={`Download ${name}`} title="Download" className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-brand-teal-light hover:text-brand-teal-deep ${FOCUS_RING}`}>
                    <Svg d={ICONS.download} />
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onRemove(f)}
                      disabled={busy}
                      aria-label={`Remove ${name}`}
                      title="Remove"
                      className={`rounded-md p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40 ${FOCUS_RING}`}
                    >
                      <Svg d={ICONS.trash} />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {attach}
    </>
  );
}

// ---------------------------------------------------------------------------
// Side column
// ---------------------------------------------------------------------------

function ClinicalPanel({ patient: p, allergies }: { patient: Patient; allergies: ReturnType<typeof allergyList> }) {
  const order = { active: 0, chronic: 1, resolved: 2 } as const;
  const conditions = [...(p.preExistingConditions ?? [])].filter((c) => has(c.condition)).sort((a, b) => order[a.status ?? 'active'] - order[b.status ?? 'active']);
  const family = Object.entries(p.familyHistory ?? {}).filter(([k]) => has(k));

  return (
    <Panel id="patient-clinical" title="Clinical background">
      <div className="divide-y divide-gray-100">
        <Group title="Allergies">
          {allergies.length === 0 ? (
            <p className="text-sm text-gray-500">None on file. That isn’t the same as none: ask the patient.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {allergies.map((a, i) => (
                <li key={i}>
                  <span className={`font-semibold ${isSevere(a.severity) ? 'text-red-700' : 'text-gray-900'}`}>{a.substance}</span>
                  {(a.reaction || a.severity) && (
                    <span className={isSevere(a.severity) ? 'text-red-700' : 'text-gray-600'}> · {[a.reaction, a.severity?.toLowerCase()].filter(Boolean).join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Group>
        <Group title="Conditions">
          {conditions.length === 0 ? (
            <p className="text-sm text-gray-500">None on file.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {conditions.map((c, i) => (
                <li key={i}>
                  <span className={c.status === 'resolved' ? 'text-gray-500' : 'text-gray-900'}>{c.condition}</span>
                  <span className="text-gray-500">
                    {' · '}
                    {c.status ?? 'active'}
                    {c.diagnosisDate ? ` since ${calendarDate(c.diagnosisDate)}` : ''}
                  </span>
                  {has(c.notes) && <span className="block text-gray-500">{c.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </Group>
        {has(p.medicalHistory) && (
          <Group title="Medical history">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{p.medicalHistory}</p>
          </Group>
        )}
        {family.length > 0 && (
          <Group title="Family history">
            <ul className="space-y-1 text-sm text-gray-700">
              {family.map(([condition, who]) => (
                <li key={condition}>
                  {condition}
                  {has(who) && <span className="text-gray-500"> · {who}</span>}
                </li>
              ))}
            </ul>
          </Group>
        )}
      </div>
    </Panel>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-5 py-3.5">
      <h3 className="mb-1.5 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function DetailsPanel({ patient: p, missing, canEdit, patientId }: { patient: Patient; missing: string[]; canEdit: boolean; patientId: string }) {
  const address = [p.address?.street, p.address?.city, p.address?.state, p.address?.zipCode].filter(has).join(', ');
  const ec = p.emergencyContact;
  return (
    <Panel id="patient-details" title="Contact and details">
      {missing.length > 0 && (
        <p className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
          <Svg d={ICONS.alert} className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Not on file: {missing.join(', ')}.
            {canEdit && (
              <>
                {' '}
                <Link href={`/patients/${patientId}/edit`} className={`rounded font-semibold underline underline-offset-2 hover:text-amber-900 ${FOCUS_RING}`}>
                  Add them
                </Link>
              </>
            )}
          </span>
        </p>
      )}
      <dl className="divide-y divide-gray-100 py-1">
        <Field label="Phone">
          {has(p.phone) ? (
            <a href={`tel:${p.phone}`} className={`rounded font-mono hover:text-brand-teal-deep ${FOCUS_RING}`}>
              {p.phone}
            </a>
          ) : (
            <NotOnFile />
          )}
        </Field>
        <Field label="Email">
          {has(p.email) ? (
            <a href={`mailto:${p.email}`} className={`rounded hover:text-brand-teal-deep ${FOCUS_RING}`}>
              {p.email}
            </a>
          ) : (
            <NotOnFile />
          )}
        </Field>
        <Field label="Address">{address || <NotOnFile />}</Field>
        <Field label="Emergency">
          {ec?.name || ec?.phone ? (
            <>
              {ec.name}
              {ec.relationship && <span className="text-gray-500"> · {ec.relationship}</span>}
              {ec.phone && <span className="block font-mono">{ec.phone}</span>}
            </>
          ) : (
            <NotOnFile />
          )}
        </Field>
        {has(p.identifiers?.philHealth) && (
          <Field label="PhilHealth">
            <span className="font-mono">{p.identifiers!.philHealth}</span>
          </Field>
        )}
        {has(p.identifiers?.govId) && (
          <Field label="Government ID">
            <span className="font-mono">{p.identifiers!.govId}</span>
          </Field>
        )}
        {has(p.civilStatus) && <Field label="Civil status">{titleCase(p.civilStatus!)}</Field>}
        {has(p.nationality) && <Field label="Nationality">{p.nationality}</Field>}
        {has(p.occupation) && <Field label="Occupation">{p.occupation}</Field>}
      </dl>
    </Panel>
  );
}

function BillingPanel({ billing, currency, canInvoice, patientId }: { billing: NonNullable<PatientRecord['billing']>; currency: string; canInvoice: boolean; patientId: string }) {
  const owed = billing.outstanding > 0;
  return (
    <Panel
      id="patient-billing"
      title="Billing"
      aside={
        canInvoice ? (
          <Link href={`/invoices/new?patientId=${patientId}`} className={`rounded text-sm font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
            New invoice
          </Link>
        ) : null
      }
    >
      {billing.total === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">No invoices yet.</p>
      ) : (
        <dl className="divide-y divide-gray-100 py-1">
          <Field label="Balance due">
            <span className={`font-mono font-semibold ${owed ? 'text-red-700' : 'text-gray-900'}`}>{money(billing.outstanding, currency)}</span>
            {owed && <span className="text-red-700"> · {billing.unpaidCount} unpaid</span>}
          </Field>
          <Field label="Billed">
            <span className="font-mono">{money(billing.billed, currency)}</span>
            <span className="text-gray-500"> · {billing.total} invoice{billing.total === 1 ? '' : 's'}</span>
          </Field>
          <Field label="Paid">
            <span className="font-mono">{money(billing.paid, currency)}</span>
          </Field>
        </dl>
      )}
    </Panel>
  );
}

function AppAccessPanel({ patientId, fallbackEmail, firstName }: { patientId: string; fallbackEmail?: string; firstName: string }) {
  const ids = useId();
  const status = useKeyedFetch<{ hasPassword: boolean; email: string | null }>(`/api/patients/${patientId}/app-credentials`);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [qr, setQr] = useState<{ data: string; expiresAt: string } | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const s = status.value;
  const loginEmail = s?.email ?? fallbackEmail ?? null;

  // A sign-in QR is a credential: issued on demand (replacing the last one), never cached.
  const issueQr = async () => {
    setQrError(null);
    setDone(null);
    setQrBusy(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/login-qr`, { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'The sign-in QR code wasn’t created'));
      setQr({ data: json.data.qrData, expiresAt: json.data.expiresAt });
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'The sign-in QR code wasn’t created');
    } finally {
      setQrBusy(false);
    }
  };

  const revokeQr = async () => {
    setQrError(null);
    setQrBusy(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/login-qr`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'The sign-in QR code wasn’t cancelled'));
      setQr(null);
      setDone(`The sign-in QR code was cancelled, and ${firstName} was signed out of the eMCR app on every device.`);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'The sign-in QR code wasn’t cancelled');
    } finally {
      setQrBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords don’t match.');
    setSaving(true);
    try {
      const res = await fetch(`/api/patients/${patientId}/app-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, ...(email.trim() ? { email: email.trim() } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'The password wasn’t saved'));
      setDone(`Saved. ${firstName} can sign in as ${json.email ?? loginEmail ?? 'their email'}. Tell them the password in person or by text; it isn’t sent to them, and their other sign-ins end.`);
      setOpen(false);
      setPassword('');
      setConfirm('');
      setEmail('');
      status.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The password wasn’t saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel id="patient-app" title="Patient app">
      <div className="px-5 py-4 text-sm">
        {status.error && !s ? (
          <p className="text-gray-600">
            The sign-in status didn’t load.{' '}
            <button type="button" onClick={status.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              Try again
            </button>
          </p>
        ) : !s ? (
          <p className="text-gray-500">Checking…</p>
        ) : (
          <p className="text-gray-700">
            {s.hasPassword ? 'Can sign in' : 'No app password yet'}
            {loginEmail ? (
              <>
                {s.hasPassword ? ' as ' : '. Sign-in email will be '}
                <span className="font-medium text-gray-900">{loginEmail}</span>
              </>
            ) : (
              '. Add an email to sign in with.'
            )}
            {s.hasPassword ? '.' : loginEmail ? '.' : ''}
          </p>
        )}
        {done && (
          <p role="status" className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800">
            {done}
          </p>
        )}
        {qrError && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm font-medium text-red-700">
            <Svg d={ICONS.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {qrError}
          </p>
        )}
        {s && !open && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setDone(null);
                setOpen(true);
              }}
              className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.key} />
              {s.hasPassword ? 'Reset the password' : 'Set a password'}
            </button>
            <button
              type="button"
              onClick={issueQr}
              disabled={qrBusy}
              aria-busy={qrBusy}
              className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 font-semibold text-gray-900 hover:border-gray-900 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Svg d={ICONS.qr} />
              {qrBusy && !qr ? 'Creating…' : 'Show sign-in QR'}
            </button>
          </div>
        )}
      </div>
      <Modal open={!!qr} onOpenChange={(o) => !o && setQr(null)} className="max-w-sm" labelledBy={`${ids}-qr-title`}>
        {qr && (
          <div className="p-6 text-center">
            <h2 id={`${ids}-qr-title`} className="text-lg font-bold tracking-tight text-gray-900">
              Sign in to eMCR
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Have {firstName} open the eMCR app, choose <span className="font-medium text-gray-700">QR code</span>, and scan this.
            </p>
            <div className="mx-auto mt-5 w-fit rounded-lg border border-gray-200 bg-white p-4">
              <QRCode value={qr.data} size={208} />
            </div>
            <p className="mt-3 text-sm text-gray-700">
              Works until{' '}
              <span className="font-medium text-gray-900">
                {new Date(qr.expiresAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </span>
              , and only for one sign-in. Any earlier sign-in QR no longer works.
            </p>
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
              Anyone who scans this can sign in as {firstName}. Show it only to the patient, and don’t send a photo of it.
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <button type="button" onClick={revokeQr} disabled={qrBusy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 ${FOCUS_RING}`}>
                Cancel this code
              </button>
              <button type="button" onClick={() => setQr(null)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
      {open && (
        <form onSubmit={submit} className="motion-panel-in flex flex-col gap-3 border-t border-gray-200 bg-gray-50/60 px-5 py-4" noValidate>
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-red-700">
              <Svg d={ICONS.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          <div>
            <label htmlFor={`${ids}-email`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Sign-in email <span className="font-normal text-gray-500">(leave blank to keep {loginEmail ?? 'the one on file'})</span>
            </label>
            <input id={`${ids}-email`} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={loginEmail ?? 'patient@example.com'} className={FIELD} />
          </div>
          <div>
            <label htmlFor={`${ids}-pw`} className="mb-1.5 block text-sm font-medium text-gray-700">
              New password
            </label>
            <input id={`${ids}-pw`} type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={FIELD} />
          </div>
          <div>
            <label htmlFor={`${ids}-pw2`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Type it again
            </label>
            <input id={`${ids}-pw2`} type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={FIELD} />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-teal-dark focus:ring-brand-teal" />
            Show the password
          </label>
          <p className="text-xs text-gray-500">This replaces any password the patient set themselves and signs them out of the app everywhere.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={saving} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 ${FOCUS_RING}`}>
              Cancel
            </button>
            <button type="submit" disabled={saving} aria-busy={saving} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}>
              {saving ? 'Saving…' : 'Save password'}
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}

type FamilyPerson = { patientId: string; firstName: string; lastName: string; patientCode: string | null; relationship: string | null; source: 'phone' | 'clinic'; active: boolean };

const RELATIONSHIPS = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'other', label: 'Other' },
] as const;

/**
 * Family accounts: who may manage this patient's records from their own eMCR login (a parent for
 * a child, an adult child for an elderly parent), and whose records this patient manages.
 * Staff add a manager only after confirming consent in person.
 */
function FamilyAccessPanel({ patientId, firstName }: { patientId: string; firstName: string }) {
  const ids = useId();
  const family = useKeyedFetch<{ guardians: FamilyPerson[]; dependents: FamilyPerson[] }>(`/api/patients/${patientId}/guardians`);
  const [open, setOpen] = useState(false);
  const [guardian, setGuardian] = useState<PatientOption | null>(null);
  const [relationship, setRelationship] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FamilyPerson | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guardian) return setError('Choose the family member from the search results.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/guardians`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardianPatientId: guardian._id, ...(relationship ? { relationship } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'Family access wasn’t added'));
      setDone(`${guardian.firstName} can now see and manage ${firstName}’s records from their own eMCR app.`);
      setOpen(false);
      setGuardian(null);
      setRelationship('');
      family.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Family access wasn’t added');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (person: FamilyPerson) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/guardians?guardianPatientId=${person.patientId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(formatApiError(json, 'Family access wasn’t removed'));
      setDone(`${person.firstName} no longer has access to ${firstName}’s records, at any clinic.`);
      family.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Family access wasn’t removed');
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  const f = family.value;
  const label = (p: FamilyPerson) => (p.relationship ? titleCase(p.relationship) : 'Family');

  return (
    <Panel id="family-access" title="Family access">
      <div className="px-5 py-4 text-sm">
        {family.error && !f ? (
          <p className="text-gray-600">
            Family access didn’t load.{' '}
            <button type="button" onClick={family.reload} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep ${FOCUS_RING}`}>
              Try again
            </button>
          </p>
        ) : !f ? (
          <p className="text-gray-500">Checking…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {f.guardians.length === 0 && f.dependents.length === 0 && <p className="text-gray-600">Nobody else manages {firstName}’s records in the app.</p>}
            {f.guardians.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">Managed by</p>
                <ul className="divide-y divide-gray-100">
                  {f.guardians.map((g) => (
                    <li key={g.patientId} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <Link href={`/patients/${g.patientId}`} className={`rounded font-medium text-gray-900 hover:text-brand-teal-dark ${FOCUS_RING}`}>
                          {g.firstName} {g.lastName}
                        </Link>
                        <span className="block text-xs text-gray-500">
                          {label(g)} · {g.source === 'clinic' ? 'added by clinic staff' : 'added in the app (until 18)'}
                          {!g.active && ' · access ended'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setRemoving(g)}
                        disabled={busy}
                        className={`shrink-0 rounded px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 ${FOCUS_RING}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {f.dependents.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{firstName} manages</p>
                <ul className="divide-y divide-gray-100">
                  {f.dependents.map((d) => (
                    <li key={d.patientId} className="py-2">
                      <Link href={`/patients/${d.patientId}`} className={`rounded font-medium text-gray-900 hover:text-brand-teal-dark ${FOCUS_RING}`}>
                        {d.firstName} {d.lastName}
                      </Link>
                      <span className="block text-xs text-gray-500">
                        {label(d)}
                        {!d.active && ' · access ended'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {done && (
          <p role="status" className="mt-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-green-800">
            {done}
          </p>
        )}
        {error && !open && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm font-medium text-red-700">
            <Svg d={ICONS.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
        {f && !open && (
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setError(null);
              setOpen(true);
            }}
            className={`mt-3 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
          >
            <Svg d={ICONS.plus} />
            Add a family manager
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={add} className="motion-panel-in flex flex-col gap-3 border-t border-gray-200 bg-gray-50/60 px-5 py-4" noValidate>
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-red-700">
              <Svg d={ICONS.alert} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          <PatientSearch label="Family member (registered here)" value={guardian} onChange={setGuardian} />
          <div>
            <label htmlFor={`${ids}-rel`} className="mb-1.5 block text-sm font-medium text-gray-700">
              They are {firstName}’s <span className="font-normal text-gray-500">· optional</span>
            </label>
            <select id={`${ids}-rel`} value={relationship} onChange={(e) => setRelationship(e.target.value)} className={FIELD}>
              <option value="">Choose…</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500">
            They will see {firstName}’s visits, prescriptions, results and bills from every clinic, and can book and check in for them. Confirm {firstName} (or their legal guardian) agrees first.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 ${FOCUS_RING}`}>
              Cancel
            </button>
            <button type="submit" disabled={busy} aria-busy={busy} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}>
              {busy ? 'Saving…' : 'Give access'}
            </button>
          </div>
        </form>
      )}
      {removing &&
        createPortal(
          <AlertDialog
            open
            onOpenChange={(o) => !o && setRemoving(null)}
            title={`Remove ${removing.firstName}’s access?`}
            description={`${removing.firstName} ${removing.lastName} will no longer see or manage ${firstName}’s records in the eMCR app, at this or any other clinic.`}
          >
            <button type="button" onClick={() => setRemoving(null)} className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              Keep access
            </button>
            <button type="button" onClick={() => remove(removing)} disabled={busy} className={`rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 ${FOCUS_RING}`}>
              Remove access
            </button>
          </AlertDialog>,
          document.body
        )}
    </Panel>
  );
}
