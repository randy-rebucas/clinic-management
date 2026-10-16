'use client';

import { useRouter } from 'next/navigation';
import PatientForm from './PatientForm';
import { PatientFormShell } from './patients/PatientFormFrame';

export default function PatientNewClient() {
  const router = useRouter();

  return (
    <PatientFormShell back={{ href: '/patients', label: 'All patients' }}>
      <header className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">New patient</h1>
        <p className="mt-1 text-sm sm:text-base text-gray-600">Register someone who hasn’t been seen at this clinic before. They get a patient code when you save.</p>
      </header>
      <PatientForm onSaved={(id) => router.push(`/patients/${id}`)} onCancel={() => router.push('/patients')} />
    </PatientFormShell>
  );
}
