import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { Types } from 'mongoose';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    // Get all unpaid and partially paid invoices for this patient at this clinic
    const invoices = await Invoice.find(tenantFilter(ctx.tenantId, {
      patient: new Types.ObjectId(id),
      status: { $in: ['unpaid', 'partial'] },
    }))
      .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: ctx.tenantObjectId } })
      .sort({ createdAt: -1 });

    const totalOutstanding = invoices.reduce(
      (sum, invoice) => sum + (invoice.outstandingBalance || 0),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        totalOutstanding,
        invoiceCount: invoices.length,
        invoices: invoices.map((inv) => ({
          _id: inv._id,
          invoiceNumber: inv.invoiceNumber,
          total: inv.total,
          outstandingBalance: inv.outstandingBalance,
          status: inv.status,
          createdAt: inv.createdAt,
          visit: inv.visit,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error fetching outstanding balance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch outstanding balance' },
      { status: 500 }
    );
  }
}
