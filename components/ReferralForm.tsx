'use client';

import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FIELD, FOCUS_RING, ICON, Svg, localKey } from './appointments/shared';
import { ADD_BUTTON, FieldError, Label, NoteArea, REMOVE_BUTTON, Section } from './visits/form/parts';
import PatientSearch, { type PatientOption } from './patients/PatientSearch';
import PatientSummary, { usePatientSummary } from './visits/form/PatientSummary';
import { useUnsavedChanges } from './hooks/useUnsavedChanges';
import { formatApiError } from './utils/apiError';
import { DIRECTIONS, DIRECTION_LABEL, type ReferralDirection, type ReferralUrgency } from '@/lib/referrals';

export interface ReferralFormContext {
  doctors: { _id: string; name: string; specialty: string | null; onLeave: boolean }[];
  myDoctorId: string | null;
  clinics: string[];
  specialties: string[];
}

export interface ReferralFormValues {
  direction: ReferralDirection;
  visitId: string;
  referringDoctor: string;
  receivingDoctor: string;
  receivingClinic: string;
  referringClinic: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  referringPatient: PatientOption | null;
  reason: string;
  urgency: ReferralUrgency;
  specialty: string;
  notes: string;
  chiefComplaint: string;
  diagnosis: string;
  relevantHistory: string;
  medications: string[];
  followUpRequired: boolean;
  followUpDate: string;
  followUpNotes: string;
}

export const emptyReferral = (myDoctorId: string | null): ReferralFormValues => ({
  direction: 'internal',
  visitId: '',
  referringDoctor: myDoctorId ?? '',
  receivingDoctor: '',
  receivingClinic: '',
  referringClinic: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  referringPatient: null,
  reason: '',
  urgency: 'routine',
  specialty: '',
  notes: '',
  chiefComplaint: '',
  diagnosis: '',
  relevantHistory: '',
  medications: [],
  followUpRequired: false,
  followUpDate: '',
  followUpNotes: '',
});

const DIRECTION_HINT: Record<ReferralDirection, string> = {
  internal: 'Another doctor at this clinic sees the patient.',
  out: 'A hospital, clinic or specialist outside. Print the letter for the patient.',
  in: 'Another clinic or doctor sent the patient to us.',
  patient: 'One of our patients recommended the clinic.',
};

const URGENCY_OPTIONS: { value: ReferralUrgency; label: string; hint: string }[] = [
  { value: 'routine', label: 'Routine', hint: 'At the next available time' },
  { value: 'urgent', label: 'Urgent', hint: 'Within days; escalated by email if still unanswered after 7' },
  { value: 'stat', label: 'STAT', hint: 'Right away' },
];

type Field = 'patient' | 'reason' | 'receivingDoctor' | 'receivingClinic' | 'referringClinic' | 'referringPatient' | 'contactEmail' | 'followUpDate';

let seq = 0;
const rowKey = () => `m${++seq}`;

/**
 * Make or edit a referral. The first question is where the patient is going; only that
 * direction's fields show. Saving lands on the referral, where the letter is printed.
 */
export default function ReferralForm({
  mode,
  context,
  initialPatient,
  initial,
  referralId,
  onSaved,
  onCancel,
}: {
  mode: 'new' | 'edit';
  context: ReferralFormContext;
  initialPatient: PatientOption | null;
  initial: ReferralFormValues;
  referralId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const router = useRouter();
  const [patient, setPatient] = useState<PatientOption | null>(initialPatient);
  const [v, setV] = useState<ReferralFormValues>(initial);
  const [meds, setMeds] = useState(() => initial.medications.map((text) => ({ key: rowKey(), text })));
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<Partial<Record<Field, string>>>({});
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const [today] = useState(() => localKey(new Date()));
  const focusRow = useRef<string | null>(null);

  const summary = usePatientSummary(patient?._id ?? null);
  const set = <K extends keyof ReferralFormValues>(key: K, value: ReferralFormValues[K]) => {
    setV((cur) => ({ ...cur, [key]: value }));
    setServerProblems((p) => (key in p ? { ...p, [key]: undefined } : p));
  };

  const medList = meds.map((m) => m.text.trim()).filter(Boolean);
  const initialKey = JSON.stringify({ ...initial, referringPatient: initial.referringPatient?._id ?? null, medications: initial.medications });
  const currentKey = JSON.stringify({ ...v, referringPatient: v.referringPatient?._id ?? null, medications: medList });
  const dirty = currentKey !== initialKey || (mode === 'new' && Boolean(patient && patient._id !== initialPatient?._id));
  useUnsavedChanges(dirty && !busy, mode === 'new' ? 'This referral is not saved yet. Leave anyway?' : 'Your changes are not saved yet. Leave anyway?');

  const d = v.direction;
  const doctorById = useMemo(() => new Map(context.doctors.map((x) => [x._id, x])), [context.doctors]);
  const receiving = v.receivingDoctor ? doctorById.get(v.receivingDoctor) : undefined;

  // Medicines the patient is on now, from their open prescriptions, to copy into the summary.
  const currentMeds = useMemo(() => {
    const out: string[] = [];
    for (const rx of summary.data?.prescriptions ?? []) {
      for (const m of rx.medications ?? []) {
        const line = [m.name, m.dose, m.frequency].filter(Boolean).join(' ');
        if (line && !out.some((x) => x.toLowerCase() === line.toLowerCase())) out.push(line);
      }
    }
    return out;
  }, [summary.data]);
  const missingMeds = currentMeds.filter((m) => !medList.some((x) => x.toLowerCase() === m.toLowerCase()));

  const problems = useMemo(() => {
    const out: Partial<Record<Field, string>> = {};
    if (mode === 'new' && !patient) out.patient = 'Choose the patient being referred.';
    if (!v.reason.trim()) out.reason = 'Say why the patient is being referred.';
    if (d === 'internal') {
      if (!v.receivingDoctor) out.receivingDoctor = 'Choose the doctor the patient is going to.';
      else if (v.receivingDoctor === v.referringDoctor) out.receivingDoctor = 'A doctor can’t refer a patient to themselves.';
    }
    if (d === 'out' && !v.receivingClinic.trim()) out.receivingClinic = 'Name the hospital, clinic or specialist.';
    if (d === 'in' && !v.referringClinic.trim() && !v.contactName.trim()) out.referringClinic = 'Name the clinic, or the person who sent the patient.';
    if (d === 'in' && v.contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(v.contactEmail.trim())) out.contactEmail = 'This doesn’t look like an email address.';
    if (d === 'patient') {
      if (!v.referringPatient) out.referringPatient = 'Choose the patient who recommended the clinic.';
      else if (patient && v.referringPatient._id === patient._id) out.referringPatient = 'A patient can’t recommend themselves.';
    }
    if (v.followUpRequired && v.followUpDate && mode === 'new' && v.followUpDate < today) out.followUpDate = 'Choose today or a later day.';
    return { ...out, ...Object.fromEntries(Object.entries(serverProblems).filter(([, m]) => m)) } as Partial<Record<Field, string>>;
  }, [mode, patient, v, d, today, serverProblems]);
  const problemCount = Object.keys(problems).length;
  const err = (f: Field) => (attempted ? problems[f] : undefined);

  const pickVisit = (visitId: string) => {
    set('visitId', visitId);
    const visit = summary.data?.visits.find((x) => x._id === visitId);
    if (!visit) return;
    const dx = (visit.diagnoses ?? [])
      .map((x) => [x.code, x.description].filter(Boolean).join(' '))
      .filter(Boolean)
      .join('; ');
    const fill: Partial<ReferralFormValues> = {};
    if (!v.chiefComplaint.trim() && visit.chiefComplaint) fill.chiefComplaint = visit.chiefComplaint;
    if (!v.diagnosis.trim() && dx) fill.diagnosis = dx;
    if (Object.keys(fill).length) {
      setV((cur) => ({ ...cur, ...fill, visitId }));
      setFilledFrom(visit.visitCode);
    }
  };

  const addMed = (text = '') => {
    const row = { key: rowKey(), text };
    if (!text) focusRow.current = row.key;
    setMeds((ms) => [...ms.filter((m) => m.text.trim() || !text), row]);
  };

  const focusFirstProblem = () =>
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-referral-form] [aria-invalid="true"], [data-referral-form] [data-invalid="true"] input');
      el?.focus();
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problemCount > 0 || (mode === 'new' && !patient)) {
      focusFirstProblem();
      return;
    }
    setBusy(true);
    setFailure(null);
    const body = {
      ...(mode === 'new' ? { patient: patient!._id } : {}),
      direction: d,
      reason: v.reason.trim(),
      urgency: v.urgency,
      specialty: v.specialty.trim(),
      notes: v.notes.trim(),
      visit: v.visitId,
      ...(d === 'internal' || d === 'out' ? { referringDoctor: v.referringDoctor } : {}),
      ...(d === 'internal' || d === 'in' || d === 'patient' ? { receivingDoctor: v.receivingDoctor } : {}),
      ...(d === 'out' ? { receivingClinic: v.receivingClinic.trim() } : {}),
      ...(d === 'in'
        ? { referringClinic: v.referringClinic.trim(), referringContact: { name: v.contactName.trim(), phone: v.contactPhone.trim(), email: v.contactEmail.trim() } }
        : {}),
      ...(d === 'patient' ? { referringPatient: v.referringPatient?._id ?? '' } : {}),
      ...(d !== 'patient'
        ? { chiefComplaint: v.chiefComplaint.trim(), diagnosis: v.diagnosis.trim(), relevantHistory: v.relevantHistory.trim(), medications: medList }
        : { chiefComplaint: '', diagnosis: '', relevantHistory: '', medications: [] }),
      followUpRequired: v.followUpRequired,
      followUpDate: v.followUpRequired ? v.followUpDate : '',
      followUpNotes: v.followUpRequired ? v.followUpNotes.trim() : '',
    };
    try {
      const res = await fetch(mode === 'new' ? '/api/referrals' : `/api/referrals/${referralId}`, {
        method: mode === 'new' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        // Field problems from the server land on their fields; anything else goes in the banner.
        const issues = Array.isArray(json?.issues) ? (json.issues as { path?: string; message?: string }[]) : [];
        const mapped: Partial<Record<Field, string>> = {};
        for (const i of issues) {
          const key = (i.path === 'referringContact.email' ? 'contactEmail' : i.path) as Field;
          if (key && ['reason', 'receivingDoctor', 'receivingClinic', 'referringClinic', 'referringPatient', 'contactEmail', 'followUpDate'].includes(key) && i.message) mapped[key] = i.message;
        }
        if (Object.keys(mapped).length) {
          setServerProblems(mapped);
          focusFirstProblem();
        }
        setFailure(Object.keys(mapped).length === issues.length && issues.length ? 'Fix the fields marked below and save again.' : formatApiError(json, 'The referral could not be saved'));
        setBusy(false);
        return;
      }
      onSaved(String(json.data._id));
    } catch {
      setFailure('The server couldn’t be reached. Nothing was saved; try again.');
      setBusy(false);
    }
  };

  const status = busy
    ? 'Saving…'
    : attempted && problemCount > 0
      ? `${problemCount === 1 ? 'One thing needs' : `${problemCount} things need`} fixing before the referral can be saved.`
      : mode === 'edit'
        ? 'Saving updates the referral; its state stays as it is.'
        : d === 'internal' || d === 'out'
          ? 'Saving records the referral as waiting for a reply. Print the letter from its page.'
          : 'Saving records the referral as waiting for the clinic to accept the patient.';

  return (
    <form data-referral-form onSubmit={submit} noValidate className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="flex min-w-0 flex-col gap-6">
        {failure && (
          <div role="alert" className="motion-chip-in flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            <p>{failure}</p>
            <button type="button" onClick={() => setFailure(null)} aria-label="Dismiss" className={`shrink-0 rounded p-0.5 text-red-700 hover:text-red-900 ${FOCUS_RING}`}>
              <Svg d={ICON.x} />
            </button>
          </div>
        )}

        <Section id={`${ids}-who`} title="Patient">
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {mode === 'new' ? (
              <div data-invalid={err('patient') ? 'true' : undefined}>
                <PatientSearch
                  value={patient}
                  onChange={(p) => {
                    setPatient(p);
                    set('visitId', '');
                    setFilledFrom(null);
                  }}
                  autoFocus={!initialPatient}
                />
                {err('patient') && <FieldError id={`${ids}-patient-err`}>{err('patient')}</FieldError>}
              </div>
            ) : (
              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-700">Patient</p>
                <p className="text-sm font-semibold text-gray-900">{patient ? `${patient.firstName} ${patient.lastName}` : 'Patient record unavailable'}</p>
                {patient?.patientCode && <p className="mt-0.5 font-mono text-xs text-gray-500">{patient.patientCode}</p>}
              </div>
            )}
            {patient && ((summary.data?.visits.length ?? 0) > 0 || v.visitId) && (
              <div>
                <Label htmlFor={`${ids}-visit`} optional>
                  From visit
                </Label>
                <select id={`${ids}-visit`} value={v.visitId} onChange={(e) => pickVisit(e.target.value)} className={FIELD}>
                  <option value="">Not linked to a visit</option>
                  {(summary.data?.visits ?? []).map((x) => (
                    <option key={x._id} value={x._id}>
                      {x.visitCode} · {new Date(x.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {x.chiefComplaint ? ` · ${x.chiefComplaint.slice(0, 40)}` : ''}
                    </option>
                  ))}
                  {v.visitId && !summary.data?.visits.some((x) => x._id === v.visitId) && <option value={v.visitId}>The linked visit</option>}
                </select>
                <p className="mt-1.5 text-xs text-gray-500">Choosing a visit fills in its complaint and diagnosis when those are empty.</p>
              </div>
            )}
          </div>
        </Section>

        <Section id={`${ids}-where`} title="Where is the patient going?">
          <div className="px-5 py-4">
            <fieldset>
              <legend className="sr-only">Direction</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {DIRECTIONS.map((x) => (
                  <label
                    key={x}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-300 bg-white px-3.5 py-3 transition-colors hover:border-gray-400 hover:bg-gray-50 has-[:checked]:border-brand-teal-dark has-[:checked]:bg-brand-teal-light/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                  >
                    <input
                      type="radio"
                      name={`${ids}-direction`}
                      value={x}
                      checked={d === x}
                      onChange={() => set('direction', x)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-teal-dark"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900">{DIRECTION_LABEL[x].label}</span>
                      <span className="block text-xs text-gray-500">{DIRECTION_HINT[x]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {(d === 'internal' || d === 'out') && (
                <div>
                  <Label htmlFor={`${ids}-from`} optional>
                    Referring doctor
                  </Label>
                  <DoctorSelect id={`${ids}-from`} value={v.referringDoctor} onChange={(x) => set('referringDoctor', x)} doctors={context.doctors} empty="No doctor named" />
                  {context.myDoctorId && v.referringDoctor === context.myDoctorId && <p className="mt-1.5 text-xs text-gray-500">You. The letter is signed with your licence number.</p>}
                </div>
              )}

              {d === 'internal' && (
                <div>
                  <Label htmlFor={`${ids}-to`}>Refer to</Label>
                  <DoctorSelect
                    id={`${ids}-to`}
                    value={v.receivingDoctor}
                    onChange={(x) => set('receivingDoctor', x)}
                    doctors={context.doctors}
                    empty="Choose a doctor"
                    invalid={Boolean(err('receivingDoctor'))}
                    describedBy={err('receivingDoctor') ? `${ids}-to-err` : undefined}
                  />
                  {err('receivingDoctor') ? (
                    <FieldError id={`${ids}-to-err`}>{err('receivingDoctor')}</FieldError>
                  ) : (
                    receiving?.onLeave && <p className="mt-1.5 text-sm text-amber-800">{receiving.name} is on leave; the patient may wait.</p>
                  )}
                </div>
              )}

              {d === 'out' && (
                <div>
                  <Label htmlFor={`${ids}-rc`}>Refer to</Label>
                  <input
                    id={`${ids}-rc`}
                    value={v.receivingClinic}
                    onChange={(e) => set('receivingClinic', e.target.value)}
                    list={`${ids}-clinics`}
                    placeholder="e.g. Dr. Ana Santos, Cardiology, St. Luke’s"
                    maxLength={200}
                    aria-invalid={Boolean(err('receivingClinic'))}
                    aria-describedby={err('receivingClinic') ? `${ids}-rc-err` : undefined}
                    className={`${FIELD} ${err('receivingClinic') ? 'border-red-400' : ''}`}
                  />
                  {err('receivingClinic') && <FieldError id={`${ids}-rc-err`}>{err('receivingClinic')}</FieldError>}
                </div>
              )}

              {d === 'in' && (
                <>
                  <div>
                    <Label htmlFor={`${ids}-fc`}>Sent by (clinic or hospital)</Label>
                    <input
                      id={`${ids}-fc`}
                      value={v.referringClinic}
                      onChange={(e) => set('referringClinic', e.target.value)}
                      list={`${ids}-clinics`}
                      placeholder="e.g. Cebu Doctors’ Hospital"
                      maxLength={200}
                      aria-invalid={Boolean(err('referringClinic'))}
                      aria-describedby={err('referringClinic') ? `${ids}-fc-err` : undefined}
                      className={`${FIELD} ${err('referringClinic') ? 'border-red-400' : ''}`}
                    />
                    {err('referringClinic') && <FieldError id={`${ids}-fc-err`}>{err('referringClinic')}</FieldError>}
                  </div>
                  <div>
                    <Label htmlFor={`${ids}-to-in`} optional>
                      Seen here by
                    </Label>
                    <DoctorSelect id={`${ids}-to-in`} value={v.receivingDoctor} onChange={(x) => set('receivingDoctor', x)} doctors={context.doctors} empty="Not decided yet" />
                  </div>
                  <div>
                    <Label htmlFor={`${ids}-cn`} optional>
                      Their doctor or contact person
                    </Label>
                    <input id={`${ids}-cn`} value={v.contactName} onChange={(e) => set('contactName', e.target.value)} placeholder="e.g. Dr. Jose Reyes" maxLength={200} autoComplete="off" className={FIELD} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 sm:col-span-1">
                    <div>
                      <Label htmlFor={`${ids}-cp`} optional>
                        Phone
                      </Label>
                      <input id={`${ids}-cp`} type="tel" value={v.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} maxLength={40} autoComplete="off" className={`${FIELD} font-mono`} />
                    </div>
                    <div>
                      <Label htmlFor={`${ids}-ce`} optional>
                        Email
                      </Label>
                      <input
                        id={`${ids}-ce`}
                        type="email"
                        value={v.contactEmail}
                        onChange={(e) => set('contactEmail', e.target.value)}
                        maxLength={254}
                        autoComplete="off"
                        aria-invalid={Boolean(err('contactEmail'))}
                        aria-describedby={err('contactEmail') ? `${ids}-ce-err` : undefined}
                        className={`${FIELD} ${err('contactEmail') ? 'border-red-400' : ''}`}
                      />
                      {err('contactEmail') && <FieldError id={`${ids}-ce-err`}>{err('contactEmail')}</FieldError>}
                    </div>
                  </div>
                </>
              )}

              {d === 'patient' && (
                <>
                  <div data-invalid={err('referringPatient') ? 'true' : undefined}>
                    <PatientSearch label="Recommended by" value={v.referringPatient} onChange={(p) => set('referringPatient', p)} />
                    {err('referringPatient') && <FieldError id={`${ids}-rp-err`}>{err('referringPatient')}</FieldError>}
                  </div>
                  <div>
                    <Label htmlFor={`${ids}-to-p`} optional>
                      Seen here by
                    </Label>
                    <DoctorSelect id={`${ids}-to-p`} value={v.receivingDoctor} onChange={(x) => set('receivingDoctor', x)} doctors={context.doctors} empty="Not decided yet" />
                  </div>
                </>
              )}
            </div>
            <datalist id={`${ids}-clinics`}>
              {context.clinics.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </Section>

        <Section id={`${ids}-why`} title="Why">
          <div className="grid gap-4 px-5 py-4">
            <div>
              <Label htmlFor={`${ids}-reason`}>Reason for referral</Label>
              <NoteArea
                id={`${ids}-reason`}
                rows={3}
                value={v.reason}
                onChange={(x) => set('reason', x)}
                maxLength={4000}
                placeholder={d === 'patient' ? 'e.g. Wants a check-up; friend of the family' : 'e.g. Persistent chest pain on exertion; please evaluate for coronary artery disease'}
                invalid={Boolean(err('reason'))}
                describedBy={err('reason') ? `${ids}-reason-err` : undefined}
              />
              {err('reason') && <FieldError id={`${ids}-reason-err`}>{err('reason')}</FieldError>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-gray-700">Urgency</legend>
                <div className="inline-flex flex-wrap gap-1 rounded-md border border-gray-300 bg-white p-1">
                  {URGENCY_OPTIONS.map((u) => (
                    <label
                      key={u.value}
                      className="cursor-pointer rounded px-3.5 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 has-[:checked]:bg-brand-teal-dark has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal has-[:focus-visible]:ring-offset-1"
                    >
                      <input type="radio" name={`${ids}-urgency`} value={u.value} checked={v.urgency === u.value} onChange={() => set('urgency', u.value)} className="sr-only" />
                      {u.label}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-gray-500">{URGENCY_OPTIONS.find((u) => u.value === v.urgency)?.hint}.</p>
              </fieldset>
              {d !== 'patient' && (
                <div>
                  <Label htmlFor={`${ids}-sp`} optional>
                    Specialty needed
                  </Label>
                  <input
                    id={`${ids}-sp`}
                    value={v.specialty}
                    onChange={(e) => set('specialty', e.target.value)}
                    list={`${ids}-specialties`}
                    placeholder={receiving?.specialty ?? 'e.g. Cardiology'}
                    maxLength={200}
                    className={FIELD}
                  />
                  <datalist id={`${ids}-specialties`}>
                    {context.specialties.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor={`${ids}-notes`} optional>
                Notes
              </Label>
              <NoteArea id={`${ids}-notes`} rows={2} value={v.notes} onChange={(x) => set('notes', x)} maxLength={4000} placeholder="Anything else the receiving doctor or the front desk should know" />
            </div>
          </div>
        </Section>

        {d !== 'patient' && (
          <Section
            id={`${ids}-clinical`}
            title={d === 'in' ? 'From the referring doctor' : 'For the receiving doctor'}
            hint={d === 'in' ? 'What their letter says, so it is on file here.' : 'Printed on the referral letter with the patient’s allergies.'}
          >
            <div className="grid gap-4 px-5 py-4">
              {filledFrom && (
                <p className="flex items-start gap-1.5 text-sm text-brand-teal-deep">
                  <Svg d={ICON.check} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Filled in from visit {filledFrom}. Edit freely.
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${ids}-cc`} optional>
                    Chief complaint
                  </Label>
                  <NoteArea id={`${ids}-cc`} rows={2} value={v.chiefComplaint} onChange={(x) => set('chiefComplaint', x)} maxLength={2000} />
                </div>
                <div>
                  <Label htmlFor={`${ids}-dx`} optional>
                    Diagnosis
                  </Label>
                  <NoteArea id={`${ids}-dx`} rows={2} value={v.diagnosis} onChange={(x) => set('diagnosis', x)} maxLength={2000} placeholder="e.g. I20.9 Angina pectoris" />
                </div>
              </div>
              <div>
                <Label htmlFor={`${ids}-hx`} optional>
                  Relevant history
                </Label>
                <NoteArea id={`${ids}-hx`} rows={3} value={v.relevantHistory} onChange={(x) => set('relevantHistory', x)} maxLength={8000} placeholder="Findings, tests done, treatment so far" />
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-700">
                  Current medicines <span className="font-normal text-gray-500">(optional)</span>
                </p>
                {meds.length === 0 ? (
                  <p className="text-sm text-gray-500">None listed.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
                    {meds.map((m, i) => (
                      <li key={m.key} className="motion-row-in flex items-center gap-2 px-2 py-1.5">
                        <label htmlFor={`${ids}-med-${m.key}`} className="sr-only">
                          Medicine {i + 1}
                        </label>
                        <input
                          ref={(el) => {
                            if (el && focusRow.current === m.key) {
                              focusRow.current = null;
                              el.focus();
                            }
                          }}
                          id={`${ids}-med-${m.key}`}
                          value={m.text}
                          onChange={(e) => setMeds((ms) => ms.map((x) => (x.key === m.key ? { ...x, text: e.target.value } : x)))}
                          placeholder="e.g. Amlodipine 5 mg once a day"
                          maxLength={300}
                          className={`${FIELD} border-transparent`}
                        />
                        <button
                          type="button"
                          onClick={() => setMeds((ms) => ms.filter((x) => x.key !== m.key))}
                          aria-label={`Remove ${m.text.trim() || `medicine ${i + 1}`}`}
                          title="Remove"
                          className={REMOVE_BUTTON}
                        >
                          <Svg d={ICON.x} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => addMed()} className={ADD_BUTTON}>
                    <Svg d="M12 4v16m8-8H4" />
                    Add medicine
                  </button>
                  {missingMeds.length > 0 && (
                    <button type="button" onClick={() => missingMeds.forEach((m) => addMed(m))} className={ADD_BUTTON}>
                      <Svg d={ICON.check} />
                      Add {missingMeds.length === 1 ? 'the 1 current medicine' : `the ${missingMeds.length} current medicines`} from prescriptions
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Section>
        )}

        <Section id={`${ids}-fu`} title="Follow-up">
          <div className="grid gap-4 px-5 py-4">
            <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-gray-900">
              <input type="checkbox" checked={v.followUpRequired} onChange={(e) => set('followUpRequired', e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-brand-teal-dark" />
              Follow up with the patient after the referral
            </label>
            {v.followUpRequired && (
              <div className="motion-panel-in grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <div>
                  <Label htmlFor={`${ids}-fud`} optional>
                    On
                  </Label>
                  <input
                    id={`${ids}-fud`}
                    type="date"
                    value={v.followUpDate}
                    min={mode === 'new' ? today : undefined}
                    onChange={(e) => set('followUpDate', e.target.value)}
                    aria-invalid={Boolean(err('followUpDate'))}
                    aria-describedby={err('followUpDate') ? `${ids}-fud-err` : `${ids}-fud-hint`}
                    className={`${FIELD} font-mono ${err('followUpDate') ? 'border-red-400' : ''}`}
                  />
                  {err('followUpDate') ? (
                    <FieldError id={`${ids}-fud-err`}>{err('followUpDate')}</FieldError>
                  ) : (
                    <p id={`${ids}-fud-hint`} className="mt-1.5 text-xs text-gray-500">
                      With a date, the patient gets a reminder 3 days before (when follow-up reminders are on).
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor={`${ids}-fun`} optional>
                    What to follow up
                  </Label>
                  <NoteArea id={`${ids}-fun`} rows={2} value={v.followUpNotes} onChange={(x) => set('followUpNotes', x)} maxLength={2000} placeholder="e.g. Review the cardiologist’s findings; repeat ECG" />
                </div>
              </div>
            )}
          </div>
        </Section>

        <div className="motion-tray-in sticky bottom-4 z-20 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-[0_8px_30px_rgb(15,23,42,0.1)] sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${attempted && problemCount > 0 && !busy ? 'font-medium text-red-700' : 'text-gray-600'}`} aria-live="polite">
            {status}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (dirty && !window.confirm(mode === 'new' ? 'Discard this referral?' : 'Discard your changes?')) return;
                onCancel();
              }}
              disabled={busy}
              className={`rounded-md px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${FOCUS_RING}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-deep disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
            >
              <Svg d={ICON.check} />
              {busy ? 'Saving…' : mode === 'new' ? 'Save referral' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
        {patient ? (
          summary.error ? null : <PatientSummary summary={summary} />
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 px-5 py-6 text-center text-sm text-gray-500">Choose the patient to see their allergies, conditions, current medicines and last visits here.</div>
        )}
      </aside>
    </form>
  );
}

function DoctorSelect({
  id,
  value,
  onChange,
  doctors,
  empty,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (id: string) => void;
  doctors: ReferralFormContext['doctors'];
  empty: string;
  invalid?: boolean;
  describedBy?: string;
}): ReactNode {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={`${FIELD} ${invalid ? 'border-red-400' : ''}`}
    >
      <option value="">{empty}</option>
      {doctors.map((x) => (
        <option key={x._id} value={x._id}>
          {x.name}
          {x.specialty ? ` · ${x.specialty}` : ''}
          {x.onLeave ? ' (on leave)' : ''}
        </option>
      ))}
      {value && !doctors.some((x) => x._id === value) && <option value={value}>A doctor no longer on the roster</option>}
    </select>
  );
}
