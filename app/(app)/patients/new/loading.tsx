import { PatientFormSkeleton } from '@/components/patients/PatientFormFrame';

export default function NewPatientLoading() {
  return <PatientFormSkeleton back={{ href: '/patients', label: 'All patients' }} label="Opening the registration form…" />;
}
