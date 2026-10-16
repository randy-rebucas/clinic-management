import { loadDoctorPermissions } from '@/lib/doctors-page';
import DoctorsPageClient from '@/components/DoctorsPageClient';

export default async function DoctorsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const permissions = await loadDoctorPermissions('read');
  const { view } = await searchParams;
  const initialView = view === 'week' || (view === 'performance' && permissions.canSeePerformance) ? view : 'list';
  return <DoctorsPageClient permissions={permissions} initialView={initialView} />;
}
