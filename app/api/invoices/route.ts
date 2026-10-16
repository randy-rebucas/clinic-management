import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import Doctor from '@/models/Doctor';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, tenantFilter, patientTenantFilter, isValidId } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, asString } from '@/lib/api/validate';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';
import { invoiceEditableSchema, computeInvoiceTotals } from './_lib/totals';

const INVOICE_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];
const MAX_RESULTS = 1000;

export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  // Check permission to read invoices
  const permissionCheck = await requirePermission(session, 'invoices', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const patientId = asString(searchParams.get('patientId'));
    const visitId = asString(searchParams.get('visitId'));
    const status = asString(searchParams.get('status'));

    const query: Record<string, unknown> = tenantFilter(tenantId);
    if (patientId) {
      if (!isValidId(patientId)) return NextResponse.json({ success: true, data: [] });
      query.patient = new Types.ObjectId(patientId);
    }
    if (visitId) {
      if (!isValidId(visitId)) return NextResponse.json({ success: true, data: [] });
      query.visit = new Types.ObjectId(visitId);
    }
    if (status && INVOICE_STATUSES.includes(status)) {
      query.status = status;
    }

    const invoices = await Invoice.find(query)
      .populate({
        path: 'patient',
        select: 'firstName lastName patientCode email phone',
        match: patientTenantFilter(tenantId),
      })
      .populate('visit', 'visitCode date')
      .populate('professionalFeeDoctor', 'firstName lastName')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(MAX_RESULTS)
      .lean();

    return NextResponse.json({ success: true, data: invoices });
  } catch (error: any) {
    console.error('Error fetching invoices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

const createInvoiceSchema = invoiceEditableSchema.extend({
  patient: zObjectId,
});

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  // Check permission to write/create invoices
  const permissionCheck = await requirePermission(session, 'invoices', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const parsed = await parseBody(request, createInvoiceSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    // Patient model uses tenantIds (array) since patients can belong to multiple clinics
    const patient = await Patient.exists(patientTenantFilter(tenantId, { _id: new Types.ObjectId(body.patient) }));
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
        { status: 400 }
      );
    }
    if (body.visit && !(await Visit.exists(tenantFilter(tenantId, { _id: new Types.ObjectId(body.visit) })))) {
      return NextResponse.json({ success: false, error: 'Invalid visit selected' }, { status: 400 });
    }
    if (
      body.professionalFeeDoctor &&
      !(await Doctor.exists(tenantFilter(tenantId, { _id: new Types.ObjectId(body.professionalFeeDoctor) })))
    ) {
      return NextResponse.json({ success: false, error: 'Invalid doctor selected' }, { status: 400 });
    }

    const settings = await getSettings(tenantId);
    const invoicePrefix = String(settings.billingSettings?.invoicePrefix || 'INV').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 10) || 'INV';

    const totals = computeInvoiceTotals({
      items: body.items,
      discounts: body.discounts,
      professionalFee: body.professionalFee,
      tax: body.tax,
      taxRate: settings.billingSettings?.taxRate,
      appliedBy: session.userId,
    });

    const seq = await nextSequence(
      tenantId,
      'invoice',
      maxCodeSeed(Invoice, 'invoiceNumber', tenantFilter(tenantId, { invoiceNumber: { $exists: true, $ne: null } }))
    );

    const invoice = await Invoice.create({
      tenantId: tenantObjectId,
      patient: body.patient,
      visit: body.visit || undefined,
      invoiceNumber: formatCode(invoicePrefix, seq),
      items: totals.items,
      subtotal: totals.subtotal,
      professionalFee: totals.professionalFee,
      professionalFeeDoctor: body.professionalFeeDoctor || undefined,
      professionalFeeType: body.professionalFeeType,
      professionalFeeNotes: body.professionalFeeNotes,
      discounts: totals.discounts,
      tax: totals.tax,
      total: totals.total,
      insurance: body.insurance,
      payments: [],
      totalPaid: 0,
      outstandingBalance: totals.total,
      status: totals.total > 0 ? 'unpaid' : 'paid',
      createdBy: session.userId,
    });

    await invoice.populate({
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
      match: patientTenantFilter(tenantId),
    });
    await invoice.populate('visit', 'visitCode date');
    await invoice.populate('createdBy', 'name email');

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid invoice data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to create invoice' },
      { status: 500 }
    );
  }
}
