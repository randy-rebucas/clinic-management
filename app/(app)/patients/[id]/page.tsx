import { loadPatientRecordPermissions } from '@/lib/patient-record-page';
import PatientDetailClient from '@/components/PatientDetailClient';

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await loadPatientRecordPermissions();
  const { id } = await params;
  return <PatientDetailClient patientId={id} permissions={permissions} />;
}
