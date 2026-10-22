import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import PlatformInvoice from '@/models/PlatformInvoice';
import { refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';

/** GET /api/subscription/invoices: the clinic's sales invoices from DevCom Digital (admin/owner). */
export async function GET() {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!['admin', 'owner'].includes(ctx.session.role)) return refuseAccess(ctx.session, 'Forbidden', 'subscription', 'read');

  await connectDB();
  const rows = await PlatformInvoice.find({ tenantId: ctx.tenantObjectId, status: { $in: ['issued', 'cancelled'] } })
    .sort({ issuedAt: -1 })
    .select('serialNo status plan billingCycle amount currency paidAt issuedAt cancelledReason')
    .lean();
  return NextResponse.json({
    success: true,
    data: rows.map((r: any) => ({
      id: String(r._id),
      serialNo: r.serialNo,
      status: r.status,
      plan: r.plan,
      billingCycle: r.billingCycle,
      amount: r.amount,
      currency: r.currency,
      paidAt: r.paidAt,
      issuedAt: r.issuedAt,
      cancelledReason: r.cancelledReason ?? null,
      url: `/api/subscription/invoices/${r._id}`,
    })),
  });
}
