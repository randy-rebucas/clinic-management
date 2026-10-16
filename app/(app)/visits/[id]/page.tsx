import { loadVisitDetailPermissions } from '@/lib/visits-page';
import VisitDetailClient from '@/components/VisitDetailClient';

export default async function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const permissions = await loadVisitDetailPermissions();
  const { id } = await params;
  return <VisitDetailClient visitId={id} permissions={permissions} />;
}
