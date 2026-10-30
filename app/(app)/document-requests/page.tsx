import { hasPermission, requirePagePermission } from '@/app/lib/auth-helpers';
import { verifySession } from '@/app/lib/dal';
import DocumentRequestsClient from '@/components/patients/DocumentRequestsClient';
import { isCertifyingDoctor } from '@/lib/doctor-access';

export const metadata = { title: 'Document requests' };

export default async function DocumentRequestsPage() {
  // Same rules as the API: visits → read to see the requests, visits → write to release them.
  await requirePagePermission('visits', 'read');
  const session = await verifySession();
  const canWrite = await hasPermission(session, 'visits', 'write');
  // Medical certificates are released by doctors only (the API checks the same).
  const canCertify = !!session && (await isCertifyingDoctor(session));
  return <DocumentRequestsClient canWrite={canWrite} canCertify={canCertify} />;
}
