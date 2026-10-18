import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { User, Role } from '@/models';
import { isAdmin } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { USER_STATES, userShowFilter, type UserInsights, type UserState } from '@/lib/users';

/**
 * GET /api/users/insights — admin only. Clinic-wide account figures for /admin/users:
 * accounts per state, the clinic's roles with how many live accounts hold each, two-step
 * coverage, idle accounts. Counts never shrink with the list's filters.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantObjectId: tenantId } = ctx;
  if (!isAdmin(session)) {
    return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
  }

  try {
    await connectDB();
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const live = { tenantId, status: { $ne: 'inactive' } };
    const count = (show: Parameters<typeof userShowFilter>[0]) => User.countDocuments({ tenantId, ...userShowFilter(show, now) });

    const roles = await Role.find({ tenantId })
      .select('name displayName description isActive level')
      .sort({ level: -1, displayName: 1 })
      .lean<{ _id: unknown; name: string; displayName?: string; description?: string; isActive?: boolean }[]>();
    const adminRoleIds = roles.filter((r) => r.name === 'admin' || r.name === 'owner').map((r) => r._id);

    const [stateCounts, roleCounts, twoStepOn, twoStepTotal, adminsWithout, idle, signedInWeek] = await Promise.all([
      Promise.all(USER_STATES.map((s) => count(s))),
      User.aggregate<{ _id: unknown; n: number }>([{ $match: live }, { $group: { _id: '$role', n: { $sum: 1 } } }]),
      User.countDocuments({ ...live, mustSetPassword: { $ne: true }, totpEnabled: true }),
      User.countDocuments({ ...live, mustSetPassword: { $ne: true } }),
      adminRoleIds.length
        ? User.countDocuments({ ...live, role: { $in: adminRoleIds }, mustSetPassword: { $ne: true }, totpEnabled: { $ne: true } })
        : Promise.resolve(0),
      count('idle'),
      User.countDocuments({ ...live, lastLogin: { $gte: weekAgo } }),
    ]);

    const perRole = new Map(roleCounts.map((r) => [String(r._id), r.n]));
    const data: UserInsights = {
      byState: Object.fromEntries(USER_STATES.map((s, i) => [s, stateCounts[i]])) as Record<UserState, number>,
      roles: roles.map((r) => ({
        _id: String(r._id),
        name: r.name,
        displayName: r.displayName || r.name,
        description: r.description?.trim() || null,
        isActive: r.isActive !== false,
        count: perRole.get(String(r._id)) ?? 0,
      })),
      twoStep: { on: twoStepOn, total: twoStepTotal, adminsWithout },
      idle,
      signedInWeek,
    };
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error loading user insights:', error);
    return NextResponse.json({ success: false, error: 'Failed to load account figures' }, { status: 500 });
  }
}
