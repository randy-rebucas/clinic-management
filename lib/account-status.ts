import User from '@/models/User';
import { createAuditLog } from '@/lib/audit';
import { revokeUserSessions } from '@/app/lib/dal';
import { tenantFilter } from '@/lib/api/tenant-session';
import { checkSubscriptionLimit } from '@/lib/subscription-limits';
import type { UserStatus } from '@/lib/users';

const VERB: Record<UserStatus, string> = {
  active: 'Reactivated',
  suspended: 'Suspended',
  inactive: 'Closed',
};

type Actor = { userId: string; email?: string; role?: string };

/**
 * Change a login account's access: one rule for /admin/users and /admin/staff.
 * Never your own account; suspending or closing ends every session at once; reopening a
 * closed account counts against the plan's account limit again; audited with the reason.
 */
export async function changeAccountStatus(options: {
  tenantId: string;
  actor: Actor;
  userId: string;
  status: UserStatus;
  reason?: string;
}): Promise<{ ok: true; changed: boolean } | { ok: false; status: number; error: string }> {
  const { tenantId, actor, userId, status, reason } = options;
  if (userId === actor.userId) {
    return { ok: false, status: 400, error: 'You can’t change your own account’s access. Ask another administrator.' };
  }

  const current = await User.findOne(tenantFilter(tenantId, { _id: userId }))
    .select('name status')
    .lean<{ name: string; status: string } | null>();
  if (!current) return { ok: false, status: 404, error: 'Account not found' };
  if (current.status === status) return { ok: true, changed: false };

  if (current.status === 'inactive' && status !== 'inactive') {
    const limit = await checkSubscriptionLimit(tenantId, 'createUser');
    if (!limit.allowed) {
      return { ok: false, status: 403, error: limit.reason || 'The plan’s account limit is reached, so this account can’t be reopened.' };
    }
  }

  await User.updateOne(tenantFilter(tenantId, { _id: userId }), { $set: { status } });
  if (status !== 'active') await revokeUserSessions(userId);

  await createAuditLog({
    userId: actor.userId,
    userEmail: actor.email,
    userRole: actor.role,
    tenantId,
    action: 'update',
    resource: 'user',
    resourceId: userId,
    description: `${VERB[status]} ${current.name}’s account${reason ? `: ${reason}` : ''}`,
    changes: [{ field: 'status', oldValue: current.status, newValue: status }],
  });

  return { ok: true, changed: true };
}
