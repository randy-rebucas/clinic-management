'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PatientForm from './PatientForm';
import { PatientFormShell, PatientFormSkeleton } from './patients/PatientFormFrame';
import type { PatientRecord } from './patients/form';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING, ICON, Svg } from './appointments/shared';

export default function PatientEditClient({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { value: patient, loading, error, reload } = useKeyedFetch<PatientRecord>(`/api/patients/${patientId}`);
  const back = { href: `/patients/${patientId}`, label: 'Back to the record' };

  if (!patient && loading) return <PatientFormSkeleton back={back} label="Opening the patient…" />;

  if (!patient) {
    const missing = error === 'Patient not found';
    return (
      <PatientFormShell back={missing ? { href: '/patients', label: 'All patients' } : back}>
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-md ${missing ? 'bg-gray-100 text-gray-500' : 'bg-red-50 text-red-600'}`}>
            <Svg d={ICON.alert} className="h-5 w-5" />
          </span>
          <h1 className="text-base font-semibold text-gray-900">{missing ? 'This patient isn’t registered at this clinic' : 'The patient couldn’t be loaded'}</h1>
          <p className="max-w-md text-sm text-gray-500">{missing ? 'They may have been removed, or the link is for another clinic.' : error ?? 'Something went wrong.'}</p>
          {missing ? (
            <Link href="/patients" className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              All patients
            </Link>
          ) : (
            <button type="button" onClick={reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
              Try again
            </button>
          )}
        </div>
      </PatientFormShell>
    );
  }

  const name = [patient.firstName, patient.middleName, patient.lastName, patient.suffix].filter(Boolean).join(' ');

  return (
    <PatientFormShell back={back}>
      <header className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Edit {name}</h1>
        {patient.patientCode && <p className="mt-1 font-mono text-sm text-gray-600">{patient.patientCode}</p>}
      </header>
      <PatientForm key={patient._id} patient={patient} onSaved={(id) => router.push(`/patients/${id}`)} onCancel={() => router.push(`/patients/${patientId}`)} />
    </PatientFormShell>
  );
}
