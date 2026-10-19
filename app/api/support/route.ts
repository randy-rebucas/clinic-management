import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SupportRequest from '@/models/SupportRequest';
import Tenant from '@/models/Tenant';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { NewTicketSchema, notifyPlatformTeam } from '@/lib/support';
import { supportReference } from '@/lib/platform-console';

/** GET /api/support — the clinic's support requests, newest activity first. Admins only. */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Only clinic administrators can contact support');

  await connectDB();
  const rows = await SupportRequest.find(tenantFilter(ctx.tenantId))
    .select('subject category status lastReplyBy lastActivityAt createdAt replies._id')
    .sort({ lastActivityAt: -1, createdAt: -1 })
    .limit(100)
    .lean<any[]>();
  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      id: String(r._id),
      reference: supportReference(String(r._id)),
      subject: r.subject,
      category: r.category,
      status: r.status,
      replies: r.replies?.length ?? 0,
      lastReplyBy: r.lastReplyBy ?? 'requester',
      lastActivityAt: r.lastActivityAt ?? r.createdAt,
    })),
  });
}

/** POST /api/support — open a support request with the MyClinicSoft team. Admins only. */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Only clinic administrators can contact support', 'administration', 'write');

  const parsed = await parseBody(request, NewTicketSchema);
  if (isValidationError(parsed)) return parsed;

  await connectDB();
  const now = new Date();
  const ticket = await SupportRequest.create({
    tenantId: ctx.tenantObjectId,
    userId: ctx.session.userId,
    email: ctx.session.email,
    subject: parsed.data.subject,
    category: parsed.data.category,
    message: parsed.data.message,
    status: 'open',
    source: 'clinic',
    lastActivityAt: now,
    lastReplyBy: 'requester',
  });

  const tenant = await Tenant.findById(ctx.tenantId).select('name displayName').lean<any>();
  void notifyPlatformTeam(String(ticket._id), parsed.data.subject, tenant?.displayName || tenant?.name || 'a clinic', ctx.session.email, parsed.data.message, true);

  return NextResponse.json(
    { success: true, data: { id: String(ticket._id), reference: supportReference(String(ticket._id)) } },
    { status: 201 }
  );
}
