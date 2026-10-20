import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { STAFF_SENDER_ROLES } from '@/lib/notify';

/**
 * GET /api/notifications/recipients — who a doctor or admin can send a notification to:
 * the clinic's active staff (not the caller) and the roles among them.
 */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!STAFF_SENDER_ROLES.includes(ctx.session.role)) {
    return refuseAccess(ctx.session, 'Only doctors and clinic administrators can send notifications', 'notifications', 'write');
  }

  await connectDB();
  await import('@/models/Role');
  const users = await User.find({ tenantId: ctx.tenantObjectId, status: 'active', _id: { $ne: new Types.ObjectId(ctx.session.userId) } })
    .select('name email role')
    .populate('role', 'name displayName')
    .sort({ name: 1 })
    .limit(500)
    .lean<any[]>();

  const staff = users
    .filter((u) => u.role?.name !== 'medical-representative')
    .map((u) => ({ id: String(u._id), name: u.name || u.email, role: u.role?.name ?? null, roleLabel: u.role?.displayName ?? u.role?.name ?? null }));
  const roles = [...new Map(staff.filter((s) => s.role).map((s) => [s.role!, { name: s.role!, label: s.roleLabel ?? s.role! }])).values()];

  return NextResponse.json({ success: true, data: { staff, roles } });
}
