'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReferralForm, { emptyReferral, type ReferralFormContext, type ReferralFormValues } from './ReferralForm';
import type { PatientOption } from './patients/PatientSearch';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg, localKey } from './appointments/shared';
import { direction, type Referral } from './referrals/shared';

/** The stored referral as form values (the form's own shape, not the API's). */
function valuesFrom(r: Referral): ReferralFormValues {
  return {
    direction: direction(r),
    visitId: r.visit?._id ?? '',
    referringDoctor: r.referringDoctor?._id ?? '',
    receivingDoctor: r.receivingDoctor?._id ?? '',
    receivingClinic: r.receivingClinic ?? '',
    referringClinic: r.referringClinic ?? '',
    contactName: r.referringContact?.name ?? '',
    contactPhone: r.referringContact?.phone ?? '',
    contactEmail: r.referringContact?.email ?? '',
    referringPatient: r.referringPatient ? { _id: r.referringPatient._id, firstName: r.referringPatient.firstName, lastName: r.referringPatient.lastName, patientCode: r.referringPatient.patientCode } : null,
    reason: r.reason ?? '',
    urgency: r.urgency ?? 'routine',
    specialty: r.specialty ?? '',
    notes: r.notes ?? '',
    chiefComplaint: r.chiefComplaint ?? '',
    diagnosis: r.diagnosis ?? '',
    relevantHistory: r.relevantHistory ?? '',
    medications: r.medications ?? [],
    followUpRequired: Boolean(r.followUpRequired),
    followUpDate: r.followUpDate ? localKey(new Date(r.followUpDate)) : '',
    followUpNotes: r.followUpNotes ?? '',
  };
}

export default function ReferralFormClient({ patientId, visitId, referralId }: { patientId?: string; visitId?: string; referralId?: string }) {
  const router = useRouter();
  const context = useKeyedFetch<ReferralFormContext>('/api/referrals/form-context');
  // A link from a patient's page names the patient; look them up rather than search.
  const pre = useKeyedFetch<PatientOption>(!referralId && patientId ? `/api/patients/${patientId}` : null);
  const existing = useKeyedFetch<Referral>(referralId ? `/api/referrals/${referralId}` : null);

  const editing = Boolean(referralId);
  const back = editing
    ? { href: `/referrals/${referralId}`, label: 'Back to the referral' }
    : patientId
      ? { href: `/patients/${patientId}`, label: 'Back to the patient' }
      : { href: '/referrals', label: 'All referrals' };
  const title = editing ? 'Edit referral' : 'Refer a patient';

  const failed = context.error ?? existing.error;
  if (failed) {
    return (
      <Shell back={back}>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-red-600">
            <Svg d={ICON.alert} className="h-5 w-5" />
          </div>
          <p className="font-semibold text-gray-900">{/not found/i.test(failed) ? 'Referral not found' : 'The form didn’t load'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{failed}. Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => {
              context.reload();
              existing.reload();
            }}
            className={`mt-5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  const r = existing.value;
  const ready = context.value && (!editing || r) && (editing || !patientId || pre.value || pre.error);
  if (!ready) {
    return (
      <Shell back={back}>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]" aria-hidden="true">
          <div className="space-y-6 animate-pulse">
            <div className="h-28 rounded-lg border border-gray-200 bg-white" />
            <div className="h-56 rounded-lg border border-gray-200 bg-white" />
            <div className="h-48 rounded-lg border border-gray-200 bg-white" />
          </div>
          <div className="hidden h-64 animate-pulse rounded-lg border border-gray-200 bg-white xl:block" />
        </div>
        <span className="sr-only" role="status">
          Loading the referral form…
        </span>
      </Shell>
    );
  }

  if (editing && r && r.status !== 'pending' && r.status !== 'accepted') {
    return (
      <Shell back={back}>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <p className="font-semibold text-gray-900">This referral is closed</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">Seen, declined and cancelled referrals keep the details they were closed with.</p>
          <Link href={back.href} className={`mt-5 inline-block rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
            {back.label}
          </Link>
        </div>
      </Shell>
    );
  }

  const ctx = context.value!;
  const initialPatient: PatientOption | null = editing
    ? r?.patient
      ? { _id: r.patient._id, firstName: r.patient.firstName, lastName: r.patient.lastName, patientCode: r.patient.patientCode }
      : null
    : (pre.value ?? null);
  const initial = editing && r ? valuesFrom(r) : { ...emptyReferral(ctx.myDoctorId), visitId: visitId ?? '' };

  return (
    <Shell back={back}>
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">
          {editing ? (
            <>
              {r?.referralCode && <span className="font-mono">{r.referralCode}</span>} · its state and dates stay as they are.
            </>
          ) : (
            'To a doctor here or outside, or record a patient another clinic or a patient sent to you.'
          )}
        </p>
      </header>
      <ReferralForm
        mode={editing ? 'edit' : 'new'}
        context={ctx}
        initialPatient={initialPatient}
        initial={initial}
        referralId={referralId}
        onSaved={(id) => router.push(`/referrals/${id}?saved=${editing ? 'edit' : 'new'}`)}
        onCancel={() => router.push(back.href)}
      />
    </Shell>
  );
}

function Shell({ back, children }: { back: { href: string; label: string }; children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <Link href={back.href} className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
          <Svg d={ICON.chevL} />
          {back.label}
        </Link>
        {children}
      </div>
    </section>
  );
}
