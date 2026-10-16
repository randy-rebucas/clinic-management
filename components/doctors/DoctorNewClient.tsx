'use client';

import DoctorForm from './DoctorForm';
import type { DoctorRow } from './shared';
import { PatientFormShell } from '../patients/PatientFormFrame';

/** Add a doctor, or (with `self`) the signed-in user's own profile, pre-filled from their login. */
export default function DoctorNewClient({ self }: { self: Pick<DoctorRow, 'firstName' | 'lastName' | 'email' | 'phone'> | null }) {
  return (
    <PatientFormShell back={{ href: '/doctors', label: 'All doctors' }}>
      <header>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">{self ? 'Add yourself as a doctor' : 'Add a doctor'}</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">
          {self
            ? 'So you can be booked, write visit notes as the attending doctor, and sign prescriptions.'
            : 'They get a login of their own, can be booked, and appear on the roster.'}
        </p>
      </header>
      <DoctorForm self={Boolean(self)} doctor={self ? { ...self, licenseNumber: '', status: 'active' } : undefined} />
    </PatientFormShell>
  );
}
