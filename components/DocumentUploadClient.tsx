'use client';

import DocumentUploadForm from './DocumentUploadForm';
import { PatientFormShell, PatientFormSkeleton } from './patients/PatientFormFrame';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import type { PatientOption } from './patients/PatientSearch';

/** Upload a document; opened from a patient's record (`?patientId=`), it is filed to them already. */
export default function DocumentUploadClient({ patientId, visitId, maxBytes }: { patientId?: string; visitId?: string; maxBytes: number }) {
  const patient = useKeyedFetch<PatientOption>(patientId ? `/api/patients/${patientId}` : null);
  const back = patientId && patient.value ? { href: `/patients/${patientId}`, label: `Back to ${patient.value.firstName} ${patient.value.lastName}` } : { href: '/documents', label: 'All documents' };

  // Wait for the patient named in the address, so the form opens with them chosen.
  if (patientId && !patient.value && !patient.error) return <PatientFormSkeleton back={back} label="Loading the patient…" />;

  return (
    <PatientFormShell back={back}>
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Upload a document</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">
          {patient.value ? `For ${patient.value.firstName} ${patient.value.lastName}.` : 'A referral letter, an outside result, imaging, an ID or an HMO card.'}
        </p>
      </header>
      {patientId && patient.error && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The patient from the link couldn&apos;t be loaded ({patient.error}). Search for them below.
        </p>
      )}
      <DocumentUploadForm
        key={patient.value?._id ?? 'none'}
        maxBytes={maxBytes}
        initialPatient={patient.value ? { _id: patient.value._id, firstName: patient.value.firstName, lastName: patient.value.lastName, patientCode: patient.value.patientCode } : null}
        initialVisitId={patient.value ? visitId : undefined}
      />
    </PatientFormShell>
  );
}
