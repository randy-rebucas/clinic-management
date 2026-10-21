import { hasPermission, requirePagePermission } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import EmcrRequestsClient from '@/components/patients/EmcrRequestsClient';

export const metadata = { title: 'eMCR requests' };

export default async function EmcrRequestsPage() {
  // Same rules as the API: patients → read to see the requests, patients → write to decide them.
  await requirePagePermission('patients', 'read');
  const session = await verifySession();
  const canWrite = await hasPermission(session, 'patients', 'write');
  return <EmcrRequestsClient canWrite={canWrite} />;
}
