import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { denyPage, getPermissionChecker } from '@/app/lib/auth-helpers';
import { loadClinicDoctors } from '@/lib/appointments-page';

export interface QueuePermissions {
  /** queue:write — add patients */
  canAdd: boolean;
  /** queue:update — check in, call in, record vitals, finish */
  canUpdate: boolean;
  /** visits:write — start the visit from the queue */
  canStartVisit: boolean;
}

/** The queue screen's permissions and doctor roster, read on the server. */
export async function loadQueuePageContext() {
  const session = await verifySession();
  if (!session) redirect('/login');

  const can = await getPermissionChecker(session);
  if (!can('queue', 'read')) await denyPage(session, 'queue', 'read', '/dashboard?error=access_denied');

  const permissions: QueuePermissions = {
    canAdd: can('queue', 'write'),
    canUpdate: can('queue', 'update'),
    canStartVisit: can('visits', 'write'),
  };
  return { permissions, doctors: session.tenantId ? await loadClinicDoctors(session.tenantId) : [] };
}
