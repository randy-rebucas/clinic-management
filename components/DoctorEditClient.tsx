'use client';

import Link from 'next/link';
import DoctorForm from './doctors/DoctorForm';
import { doctorName, type DoctorRow } from './doctors/shared';
import { PatientFormShell, PatientFormSkeleton } from './patients/PatientFormFrame';
import { useKeyedFetch } from './hooks/useKeyedFetch';
import { FOCUS_RING } from './appointments/shared';

export default function DoctorEditClient({ doctorId }: { doctorId: string }) {
  const doctor = useKeyedFetch<DoctorRow>(`/api/doctors/${doctorId}`);
  const back = { href: `/doctors/${doctorId}`, label: doctor.value ? `Back to ${doctorName(doctor.value)}` : 'Back to the doctor' };

  if (!doctor.value && !doctor.error) return <PatientFormSkeleton back={back} label="Loading the profile…" />;

  const missing = doctor.error ? /not found/i.test(doctor.error) : false;
  return (
    <PatientFormShell back={back}>
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">Edit profile</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">{doctor.value ? doctorName(doctor.value) : 'This profile didn’t load'}</p>
      </header>
      {doctor.value ? (
        <DoctorForm key={doctor.value._id} doctor={doctor.value} />
      ) : (
        <div role="alert" className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
          <p className="font-semibold text-gray-900">{missing ? 'Doctor not found' : 'This profile didn’t load'}</p>
          <p className="mt-1 text-sm text-gray-500">{missing ? 'It may have been deleted, or it belongs to another clinic.' : `${doctor.error}. Check your connection and try again.`}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/doctors" className={`rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:border-gray-900 ${FOCUS_RING}`}>
              All doctors
            </Link>
            {!missing && (
              <button type="button" onClick={doctor.reload} className={`rounded-md bg-brand-teal-dark px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-deep ${FOCUS_RING}`}>
                Try again
              </button>
            )}
          </div>
        </div>
      )}
    </PatientFormShell>
  );
}
