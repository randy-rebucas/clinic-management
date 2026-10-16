import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import { membershipPermissions, type MembershipPermissions } from '@/lib/membership-access';

export interface MembershipPagePermissions extends MembershipPermissions {
  /** Link the member's name to their patient record. */
  canSeePatient: boolean;
}

export async function loadMembershipPermissions(): Promise<MembershipPagePermissions> {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  const perms = membershipPermissions(can);
  if (!perms.canRead) redirect('/dashboard?error=access_denied');
  return { ...perms, canSeePatient: can('patients', 'read') };
}
