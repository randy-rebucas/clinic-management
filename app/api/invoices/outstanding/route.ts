import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { Types } from 'mongoose';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter, patientTenantFilter, isValidId } from '@/lib/api/tenant-session';
import { asString } from '@/lib/api/validate';

const MAX_RESULTS = 2000;

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'invoices', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const patientId = asString(searchParams.get('patientId'));

    const query: Record<string, unknown> = tenantFilter(tenantId, {
      status: { $in: ['unpaid', 'partial'] },
    });

    if (patientId) {
      if (!isValidId(patientId)) {
        return NextResponse.json({ success: false, error: 'Invalid patient ID' }, { status: 400 });
      }
      query.patient = new Types.ObjectId(patientId);
    }

    const invoices = (
      await Invoice.find(query)
        .populate({
          path: 'patient',
          select: 'firstName lastName patientCode email phone',
          match: patientTenantFilter(tenantId),
        })
        .populate('visit', 'visitCode date')
        .sort({ createdAt: -1 })
        .limit(MAX_RESULTS)
        .lean<any[]>()
    ).filter((invoice) => invoice.patient);

    const totalOutstanding = invoices.reduce(
      (sum: number, invoice: any) => sum + (invoice.outstandingBalance || 0),
      0
    );

    // Group by patient
    const byPatient = invoices.reduce((acc: any, invoice: any) => {
      const patientId = invoice.patient._id.toString();
      if (!acc[patientId]) {
        acc[patientId] = {
          patient: invoice.patient,
          totalOutstanding: 0,
          invoiceCount: 0,
          invoices: [],
        };
      }
      acc[patientId].totalOutstanding += invoice.outstandingBalance || 0;
      acc[patientId].invoiceCount += 1;
      acc[patientId].invoices.push(invoice);
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        totalOutstanding,
        totalInvoices: invoices.length,
        invoices,
        byPatient: Object.values(byPatient),
      },
    });
  } catch (error: any) {
    console.error('Error fetching outstanding invoices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch outstanding invoices' },
      { status: 500 }
    );
  }
}

