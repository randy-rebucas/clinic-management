'use client';

import { useId, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg } from '../appointments/shared';
import { ADD_BUTTON, FieldError, Label, NoteArea, REMOVE_BUTTON, Section } from '../visits/form/parts';
import { useKeyedFetch } from '../hooks/useKeyedFetch';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { formatApiError } from '../utils/apiError';
import { HoursEditor, hoursRows, rowsProblems, rowsToSchedule } from './ScheduleDialogs';
import { DOCTOR_STATE, doctorName, specialtyOf, type DoctorRow } from './shared';
import { DOCTOR_STATUSES, type DoctorStatus } from '@/lib/doctors';
import { MEDICAL_SPECIALIZATIONS } from '@/lib/constants/specializations';

type Field = 'firstName' | 'lastName' | 'email' | 'phone' | 'specialization' | 'licenseNumber';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^[+0-9 ()-]{7,20}$/;

/**
 * Add a doctor or change a profile. Required fields carry no mark; optional ones say so. Problems
 * show after the first save attempt, the first one focused. Weekly hours are set here when adding;
 * afterwards they (and time off) change on the doctor's page, where the doctor may change their own.
 */
export default function DoctorForm({ doctor, self = false }: { doctor?: Omit<DoctorRow, '_id'> & { _id?: string }; self?: boolean }) {
  const ids = useId();
  const router = useRouter();
  const editing = Boolean(doctor?._id);

  const initial = {
    title: doctor?.title ?? 'Dr.',
    firstName: doctor?.firstName ?? '',
    lastName: doctor?.lastName ?? '',
    email: doctor?.email ?? '',
    phone: doctor?.phone ?? '',
    specialization: doctor ? specialtyOf(doctor) : '',
    department: doctor?.department && doctor.department !== 'No Department' ? doctor.department : '',
    licenseNumber: doctor?.licenseNumber ?? '',
    ptr: doctor?.ptr ?? '',
    status: (doctor?.status ?? 'active') as DoctorStatus,
    bio: doctor?.bio ?? '',
  };
  const initialQuals = doctor?.qualifications ?? [];
  const [f, setF] = useState(initial);
  const [quals, setQuals] = useState<string[]>(initialQuals);
  const [qual, setQual] = useState('');
  const [hours, setHours] = useState(() => hoursRows(doctor?.schedule ?? []));
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});

  const catalogue = useKeyedFetch<{ _id: string; name: string }[]>('/api/specializations');
  const specialties = useMemo(
    () => [...new Set([...(catalogue.value ?? []).map((s) => s.name), ...MEDICAL_SPECIALIZATIONS])].sort((a, b) => a.localeCompare(b)),
    [catalogue.value]
  );

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    if (serverErrors[k as Field]) setServerErrors((e) => ({ ...e, [k]: undefined }));
  };

  const dirty =
    JSON.stringify(f) !== JSON.stringify(initial) ||
    JSON.stringify(quals) !== JSON.stringify(initialQuals) ||
    (!editing && rowsToSchedule(hours).length > 0) ||
    qual.trim() !== '';
  useUnsavedChanges(dirty && !busy, editing ? 'Your changes to this profile are not saved. Leave anyway?' : 'This doctor is not added yet. Leave anyway?');

  // --- Problems ------------------------------------------------------------------

  const hourProblems = editing ? {} : rowsProblems(hours);
  const problems: Partial<Record<Field | 'hours', string>> = {
    firstName: f.firstName.trim() ? undefined : 'Enter the first name.',
    lastName: f.lastName.trim() ? undefined : 'Enter the last name.',
    email: !f.email.trim() ? 'Enter an email. The doctor signs in with it.' : EMAIL_RE.test(f.email.trim()) ? undefined : 'This doesn’t look like an email address.',
    phone: !f.phone.trim() ? 'Enter a phone number.' : PHONE_RE.test(f.phone.trim()) ? undefined : 'Use digits, spaces, +, ( ) or -, at least 7.',
    specialization: f.specialization.trim() ? undefined : 'Choose or type the specialty.',
    licenseNumber: f.licenseNumber.trim() ? undefined : 'Enter the PRC licence number. It prints on prescriptions.',
    hours: Object.keys(hourProblems).length ? 'Fix the hours marked below.' : undefined,
    ...serverErrors,
  };
  const problemKeys = (Object.keys(problems) as (Field | 'hours')[]).filter((k) => problems[k]);
  const err = (k: Field) => (attempted || serverErrors[k] ? problems[k] : undefined);

  const addQual = () => {
    const q = qual.trim();
    if (q && !quals.includes(q)) setQuals((list) => [...list, q]);
    setQual('');
  };

  // --- Submit ----------------------------------------------------------------------

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemKeys.length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-doctor-form] [aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setFailure(null);
    const allQuals = qual.trim() && !quals.includes(qual.trim()) ? [...quals, qual.trim()] : quals;
    const body: Record<string, unknown> = {
      title: f.title.trim(),
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      phone: f.phone.trim(),
      specialization: f.specialization.trim(),
      licenseNumber: f.licenseNumber.trim(),
      ptr: f.ptr.trim(),
      department: f.department.trim(),
      status: f.status,
      bio: f.bio.trim(),
      qualifications: allQuals,
    };
    if (!editing) body.schedule = rowsToSchedule(hours);

    try {
      const res = await fetch(editing ? `/api/doctors/${doctor!._id}` : '/api/doctors', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        if (res.status === 409 && (json?.field === 'email' || json?.field === 'licenseNumber')) {
          setServerErrors({ [json.field as Field]: json.error });
          setFailure(null);
          requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-doctor-form] [aria-invalid="true"]')?.focus());
        } else {
          setFailure(formatApiError(json, editing ? 'The changes could not be saved' : 'The doctor could not be added'));
        }
        setBusy(false);
        return;
      }
      router.push(`/doctors/${json.data._id}?saved=${editing ? 'edited' : 'created'}`);
    } catch {
      setFailure('The server couldn’t be reached. Nothing was saved; try again.');
      setBusy(false);
    }
  };

  const who = f.lastName.trim() ? doctorName({ title: f.title, firstName: f.firstName.trim(), lastName: f.lastName.trim() }) : 'the doctor';
  const deactivating = editing && f.status === 'inactive' && doctor?.status !== 'inactive';
  const status = busy
    ? 'Saving…'
    : attempted && problemKeys.length
      ? `${problemKeys.length === 1 ? 'One thing needs' : `${problemKeys.length} things need`} fixing.`
      : editing
        ? !dirty
          ? 'No changes yet.'
          : deactivating
            ? `Saving marks ${who} inactive: they are signed out and can’t be booked.`
            : 'Saving updates the profile. Hours and time off stay as they are.'
        : self
          ? 'Adds your doctor profile and links it to your login.'
          : `Adds ${who} and emails them an invitation to set a password.`;

  return (
    <form data-doctor-form onSubmit={submit} noValidate autoComplete="off" className="flex flex-col gap-6">
      {failure && (
        <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <p>{failure}</p>
          <button type="button" onClick={() => setFailure(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
            <Svg d={ICON.x} />
          </button>
        </div>
      )}

      <Section id={`${ids}-name`} title="Name">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <Label htmlFor={`${ids}-title`} optional>
              Title
            </Label>
            <input id={`${ids}-title`} value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={50} placeholder="Dr." className={FIELD} />
          </div>
          <TextField id={`${ids}-first`} label="First name" value={f.firstName} onChange={(v) => set('firstName', v)} error={err('firstName')} autoFocus={!editing && !self} />
          <TextField id={`${ids}-last`} label="Last name" value={f.lastName} onChange={(v) => set('lastName', v)} error={err('lastName')} />
        </div>
      </Section>

      <Section id={`${ids}-practice`} title="Practice" hint="The specialty shows when booking and on the roster.">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div>
            <Label htmlFor={`${ids}-spec`}>Specialty</Label>
            <input
              id={`${ids}-spec`}
              value={f.specialization}
              onChange={(e) => set('specialization', e.target.value)}
              list={`${ids}-specs`}
              maxLength={100}
              placeholder="Start typing, e.g. Pediatrics"
              aria-invalid={Boolean(err('specialization'))}
              className={`${FIELD} ${err('specialization') ? 'border-red-400' : ''}`}
            />
            <datalist id={`${ids}-specs`}>
              {specialties.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            {err('specialization') ? (
              <FieldError id={`${ids}-spec-err`}>{err('specialization')}</FieldError>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">Pick from the list, or type one that isn’t there.</p>
            )}
          </div>
          <div>
            <Label htmlFor={`${ids}-dept`} optional>
              Department
            </Label>
            <input id={`${ids}-dept`} value={f.department} onChange={(e) => set('department', e.target.value)} maxLength={100} placeholder="e.g. Outpatient" className={FIELD} />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1.5 block text-sm font-medium text-gray-700">Status</legend>
            <div className="inline-flex flex-wrap gap-1 rounded-md border border-gray-300 bg-white p-1">
              {DOCTOR_STATUSES.map((s) => (
                <label
                  key={s}
                  className="cursor-pointer rounded px-3.5 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                >
                  <input type="radio" name={`${ids}-status`} value={s} checked={f.status === s} onChange={() => set('status', s)} className="sr-only" />
                  {DOCTOR_STATE[s].label}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {f.status === 'active'
                ? 'Can be booked and signs in as usual.'
                : f.status === 'on-leave'
                  ? 'Stays on the roster as on leave and can’t be booked. Can still sign in.'
                  : 'Off the roster, can’t be booked, and can’t sign in. Their records stay.'}
            </p>
          </fieldset>
        </div>
      </Section>

      <Section id={`${ids}-lic`} title="Licences and qualifications" hint="The licence and PTR numbers print on prescriptions and medical certificates.">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <TextField id={`${ids}-prc`} label="PRC licence number" value={f.licenseNumber} onChange={(v) => set('licenseNumber', v)} error={err('licenseNumber')} mono />
          <div>
            <Label htmlFor={`${ids}-ptr`} optional>
              PTR number
            </Label>
            <input id={`${ids}-ptr`} value={f.ptr} onChange={(e) => set('ptr', e.target.value)} maxLength={100} className={`${FIELD} font-mono`} />
          </div>
        </div>
        <div className="border-t border-gray-100">
          <p id={`${ids}-q-h`} className="px-5 pt-3 text-sm font-medium text-gray-700">
            Qualifications <span className="font-normal text-gray-500">(optional)</span>
          </p>
          {quals.length === 0 ? (
            <p className="px-5 py-2 text-sm text-gray-500">None on file.</p>
          ) : (
            <ul aria-labelledby={`${ids}-q-h`} className="divide-y divide-gray-100">
              {quals.map((q) => (
                <li key={q} className="flex items-center justify-between gap-3 px-5 py-1.5 text-sm text-gray-900">
                  {q}
                  <button type="button" onClick={() => setQuals((list) => list.filter((x) => x !== q))} aria-label={`Remove ${q}`} className={REMOVE_BUTTON}>
                    <Svg d={ICON.x} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2 px-5 pb-4 pt-2">
            <label htmlFor={`${ids}-q`} className="sr-only">
              Add a qualification
            </label>
            <input
              id={`${ids}-q`}
              value={qual}
              onChange={(e) => setQual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addQual();
                }
              }}
              maxLength={200}
              placeholder="e.g. FPCP, Diplomate in Pediatrics"
              className={`${FIELD} max-w-sm`}
            />
            <button type="button" onClick={addQual} disabled={!qual.trim()} className={`${ADD_BUTTON} disabled:opacity-50`}>
              <Svg d="M12 4v16m8-8H4" />
              Add
            </button>
          </div>
        </div>
      </Section>

      <Section id={`${ids}-contact`} title="Contact" hint={editing ? undefined : self ? 'Use the email you sign in with, so this profile links to your login.' : 'An invitation to set a password goes to this email.'}>
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <TextField id={`${ids}-email`} label="Email" type="email" value={f.email} onChange={(v) => set('email', v)} error={err('email')} />
          <TextField id={`${ids}-phone`} label="Phone" type="tel" value={f.phone} onChange={(v) => set('phone', v)} error={err('phone')} />
        </div>
      </Section>

      {editing ? (
        <p className="-mt-2 text-sm text-gray-600">
          Weekly hours and time off are changed on{' '}
          <Link href={`/doctors/${doctor!._id}`} className={`rounded font-semibold text-brand-teal-dark hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
            the doctor’s page
          </Link>
          .
        </p>
      ) : (
        <Section id={`${ids}-hours`} title="Weekly hours" hint="The days and hours the doctor usually works. Optional; they can be set later.">
          {attempted && problems.hours && (
            <div className="px-5 pt-3">
              <FieldError id={`${ids}-hours-err`}>{problems.hours}</FieldError>
            </div>
          )}
          <HoursEditor rows={hours} onChange={setHours} problems={hourProblems} showProblems={attempted} />
        </Section>
      )}

      <Section id={`${ids}-bio`} title="About" hint="Optional. A few lines for staff, e.g. languages spoken or the patients they see.">
        <div className="px-5 py-4">
          <NoteArea id={`${ids}-bio-text`} label="About the doctor" rows={3} value={f.bio} onChange={(v) => set('bio', v)} />
        </div>
      </Section>

      <div className="motion-tray-in sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgb(15,23,42,0.1)] sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-sm ${attempted && problemKeys.length && !busy ? 'font-medium text-red-700' : deactivating ? 'font-medium text-amber-800' : 'text-gray-600'}`} aria-live="polite">
          {status}
        </p>
        <div className="flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (dirty && !window.confirm(editing ? 'Discard your changes?' : 'Discard this doctor?')) return;
              router.push(editing ? `/doctors/${doctor!._id}` : '/doctors');
            }}
            disabled={busy}
            className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (editing && !dirty)}
            aria-busy={busy}
            className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
          >
            <Svg d={ICON.check} />
            {busy ? 'Saving…' : editing ? 'Save changes' : self ? 'Add my profile' : 'Add doctor'}
          </button>
        </div>
      </div>
    </form>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  mono,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  mono?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={type === 'email' ? 254 : 100}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`${FIELD} ${mono ? 'font-mono' : ''} ${error ? 'border-red-400' : ''}`}
      />
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
    </div>
  );
}
