import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { addSupportReply, ReplySchema } from '@/lib/support';

/** POST /api/support/:id/replies — the clinic answers the support team. Admins only. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!isAdmin(ctx.session)) return refuseAccess(ctx.session, 'Only clinic administrators can contact support', 'administration', 'write');
  const { id } = await params;
  if (!isValidId(id)) return notFound('Support request');

  const parsed = await parseBody(request, ReplySchema.pick({ message: true }));
  if (isValidationError(parsed)) return parsed;

  await connectDB();
  const tenant = await Tenant.findById(ctx.tenantId).select('name displayName').lean<any>();
  const result = await addSupportReply({
    id,
    tenantId: ctx.tenantId,
    authorType: 'requester',
    authorEmail: ctx.session.email,
    message: parsed.data.message,
    clinicName: tenant?.displayName || tenant?.name,
  });
  if (!result) return notFound('Support request');
  return NextResponse.json({ success: true, data: result });
}
