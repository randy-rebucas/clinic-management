import { PatientFormSkeleton } from '@/components/patients/PatientFormFrame';

export default function EditPatientLoading() {
  return <PatientFormSkeleton back={{ href: '/patients', label: 'All patients' }} label="Opening the patient…" />;
}
