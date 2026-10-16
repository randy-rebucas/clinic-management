'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LabResultForm, { type PlacedOrder } from './LabResultForm';
import type { PatientOption } from './patients/PatientSearch';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';

const PRINT = 'M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z';

export default function LabResultFormClient({ patientId, visitId }: { patientId?: string; visitId?: string }) {
  const router = useRouter();
  // A link from a patient's page or a visit names the patient; look them up rather than search.
  const pre = useKeyedFetch<PatientOption>(patientId ? `/api/patients/${patientId}` : null);
  const [placed, setPlaced] = useState<{ patient: PatientOption; orders: PlacedOrder[] } | null>(null);
  const [round, setRound] = useState(0);
  // "Order more tests" starts again for the same patient.
  const [carry, setCarry] = useState<PatientOption | null>(null);

  const back = patientId ? { href: `/patients/${patientId}`, label: 'Back to the patient' } : { href: '/lab-results', label: 'All lab results' };

  if (placed) {
    const { patient, orders } = placed;
    const who = `${patient.firstName} ${patient.lastName}`;
    return (
      <Shell back={back}>
        <header>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{orders.length === 1 ? 'Test ordered' : `${orders.length} tests ordered`}</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            For <span className="font-semibold text-gray-900">{who}</span>. Print the request forms for the lab, or open a test to follow it.
          </p>
        </header>
        <section role="status" className="motion-panel-in overflow-hidden rounded-lg border border-gray-200 bg-white">
          <ul className="divide-y divide-gray-100">
            {orders.map((o, i) => (
              <li key={o._id} className="motion-row-in flex flex-wrap items-center gap-3 px-5 py-3" style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-teal-light text-brand-teal-deep">
                  <Svg d={ICON.check} className="h-3.5 w-3.5" />
                </span>
                <Link href={`/lab-results/${o._id}`} className={`min-w-0 flex-1 rounded font-semibold text-gray-900 hover:text-brand-teal-deep hover:underline ${FOCUS_RING}`}>
                  {o.testType}
                  {o.requestCode && <span className="ml-2 font-mono text-xs font-normal text-gray-500">{o.requestCode}</span>}
                </Link>
                <a
                  href={`/api/lab-results/${o._id}/request-form`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
                >
                  <Svg d={PRINT} />
                  Request form
                </a>
              </li>
            ))}
          </ul>
        </section>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCarry(patient);
              setPlaced(null);
              setRound((r) => r + 1);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}
          >
            <Svg d="M12 4v16m8-8H4" />
            Order more tests
          </button>
          <Link href={`/patients/${patient._id}`} className={`inline-flex items-center gap-1.5 rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
            Open {who}’s record
            <Svg d={ICON.arrow} />
          </Link>
        </div>
      </Shell>
    );
  }

  const waitingForPatient = Boolean(patientId) && !pre.value && !pre.error;

  return (
    <Shell back={back}>
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Order lab tests</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">Choose the patient and the tests. Each test gets a request form to print for the lab.</p>
      </header>
      {patientId && pre.error && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The patient from the link couldn’t be loaded ({pre.error}). Search for them below.
        </p>
      )}
      {waitingForPatient ? (
        <div className="animate-pulse space-y-6" aria-hidden="true">
          <div className="h-28 rounded-lg border border-gray-200 bg-white" />
          <div className="h-56 rounded-lg border border-gray-200 bg-white" />
        </div>
      ) : (
        <LabResultForm
          key={`${round}-${pre.value?._id ?? 'none'}`}
          initialPatient={carry ?? (pre.value ? { _id: pre.value._id, firstName: pre.value.firstName, lastName: pre.value.lastName, patientCode: pre.value.patientCode } : null)}
          initialVisitId={visitId}
          onPlaced={(patient, orders) => {
            setPlaced({ patient, orders });
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onCancel={() => router.push(back.href)}
        />
      )}
      {waitingForPatient && (
        <span className="sr-only" role="status">
          Loading the patient…
        </span>
      )}
    </Shell>
  );
}

function Shell({ back, children }: { back: { href: string; label: string }; children: ReactNode }) {
  return (
    <section className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link href={back.href} className={`inline-flex w-fit items-center gap-1.5 rounded text-sm font-semibold text-gray-600 hover:text-gray-900 ${FOCUS_RING}`}>
          <Svg d={ICON.chevL} />
          {back.label}
        </Link>
        {children}
      </div>
    </section>
  );
}
