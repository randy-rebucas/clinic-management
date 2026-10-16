'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import InvoiceForm from './InvoiceForm';
import type { PatientOption } from './patients/PatientSearch';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';

export default function InvoiceFormClient({ patientId, visitId }: { patientId?: string; visitId?: string }) {
  const router = useRouter();
  // A link from a patient's page or a visit names the patient; look them up rather than search.
  const pre = useKeyedFetch<PatientOption>(patientId ? `/api/patients/${patientId}` : null);
  const back = patientId ? { href: `/patients/${patientId}`, label: 'Back to the patient' } : { href: '/invoices', label: 'All invoices' };
  const waitingForPatient = Boolean(patientId) && !pre.value && !pre.error;

  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link href={back.href} className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
          <Svg d={ICON.chevL} />
          {back.label}
        </Link>
        <header>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">New invoice</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">Bill a patient for services, a doctor’s fee or both. You can take the payment as soon as it is saved.</p>
        </header>
        {patientId && pre.error && (
          <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            The patient from the link couldn’t be loaded ({pre.error}). Search for them below.
          </p>
        )}
        {waitingForPatient ? (
          <Skeleton>
            <span className="sr-only" role="status">
              Loading the patient…
            </span>
          </Skeleton>
        ) : (
          <InvoiceForm
            key={pre.value?._id ?? 'none'}
            initialPatient={pre.value ? { _id: pre.value._id, firstName: pre.value.firstName, lastName: pre.value.lastName, patientCode: pre.value.patientCode, phone: pre.value.phone } : null}
            initialVisitId={visitId}
            onCancel={() => router.push(back.href)}
          />
        )}
      </div>
    </section>
  );
}

function Skeleton({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="animate-pulse space-y-6" aria-hidden="true">
        <div className="h-28 rounded-lg border border-gray-200 bg-white" />
        <div className="h-56 rounded-lg border border-gray-200 bg-white" />
      </div>
      {children}
    </>
  );
}
