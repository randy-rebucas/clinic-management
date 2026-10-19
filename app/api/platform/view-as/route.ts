import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { createViewAsSession, type StaffRole } from '@/app/lib/dal';
import { consumeViewAsHandoff } from '@/lib/platform-auth';
import { getTenantContext } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { getClientIp } from '@/lib/middleware/rate-limit';

/**
 * GET /api/platform/view-as?t=<hand-off token>  (on the clinic's subdomain)
 * Spends the platform console's hand-off token and starts a read-only session as the
 * named clinic admin, then opens the dashboard.
 */
export async function GET(request: NextRequest) {
  const fail = (reason: string) =>
    new NextResponse(`View as clinic failed: ${reason}. Start again from the platform console.`, {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  const handoff = await consumeViewAsHandoff(request.nextUrl.searchParams.get('t'));
  if (!handoff) return fail('the link is invalid, expired or already used');

  const ctx = await getTenantContext();
  if (ctx.tenantId !== handoff.tenantId) return fail('the link belongs to another clinic');

  await connectDB();
  await import('@/models/Role');
  const user = await User.findOne({ _id: handoff.userId, tenantId: handoff.tenantId, status: 'active' })
    .select('email sessionVersion role')
    .populate('role', 'name')
    .lean<any>();
  if (!user) return fail('that admin account is no longer active');

  await createViewAsSession({
    userId: String(user._id),
    email: user.email,
    role: (user.role?.name ?? 'admin') as StaffRole,
    roleId: user.role?._id ? String(user.role._id) : undefined,
    tenantId: handoff.tenantId,
    sessionVersion: user.sessionVersion ?? 0,
    platformEmail: handoff.platformEmail,
  });

  const h = await headers();
  await createAuditLog({
    userEmail: handoff.platformEmail,
    userRole: 'platform-admin',
    tenantId: handoff.tenantId,
    action: 'view',
    resource: 'system',
    resourceId: String(user._id),
    ipAddress: getClientIp(h),
    userAgent: h.get('user-agent') ?? undefined,
    description: `Platform admin ${handoff.platformEmail} opened a read-only view of the clinic as ${user.email}`,
    metadata: { platform: true, viewAs: user.email },
  });

  return NextResponse.redirect(new URL('/dashboard', request.url));
}
