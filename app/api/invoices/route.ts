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
import { parseBody, isValidationError, zObjectId, asString, escapeRegex } from '@/lib/api/validate';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';
import { INVOICE_STATUSES, OPEN_STATUSES, agingRange, isAgingKey } from '@/lib/invoices';
import { invoiceEditableSchema, computeInvoiceTotals, statutoryDiscountProblem, taxProfileOf } from './_lib/totals';
import { resolveInsurance } from './_lib/insurance';
import { resolvePhilhealth, capBenefit, grossOf } from './_lib/philhealth';

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
    const aging = asString(searchParams.get('aging'));
    const search = (asString(searchParams.get('search')) || '').trim().slice(0, 100);
    const pageParam = searchParams.get('page');
    const page = Math.max(parseInt(pageParam || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '', 10) || 20, 1), 100);

    const query: Record<string, unknown> = tenantFilter(tenantId);
    if (patientId) {
      if (!isValidId(patientId)) return NextResponse.json({ success: true, data: [] });
      query.patient = new Types.ObjectId(patientId);
    }
    if (visitId) {
      if (!isValidId(visitId)) return NextResponse.json({ success: true, data: [] });
      query.visit = new Types.ObjectId(visitId);
    }
    // "open" = a balance still to collect (unpaid or part paid); otherwise one known status.
    if (status === 'open') {
      query.status = { $in: OPEN_STATUSES };
    } else if (status && (INVOICE_STATUSES as string[]).includes(status)) {
      query.status = status;
    }
    // Aging buckets only make sense for balances still open.
    if (isAgingKey(aging)) {
      if (!query.status) query.status = { $in: OPEN_STATUSES };
      query.createdAt = agingRange(aging);
    }
    if (search) {
      // Invoice number, or the name / code / phone of a patient of this clinic.
      const rx = new RegExp(escapeRegex(search), 'i');
      const words = search.split(/\s+/).filter(Boolean).map((w) => new RegExp(escapeRegex(w), 'i'));
      const patientIds = await Patient.find(
        patientTenantFilter(tenantId, {
          $or: [
            { patientCode: rx },
            { phone: rx },
            words.length > 1 ? { $and: words.map((w) => ({ $or: [{ firstName: w }, { lastName: w }] })) } : { $or: [{ firstName: rx }, { lastName: rx }] },
          ],
        })
      )
        .select('_id')
        .limit(500)
        .lean();
      query.$or = [{ invoiceNumber: rx }, { patient: { $in: patientIds.map((p) => p._id) } }];
    }

    // Paged when `page` is passed (the invoices list): list fields only, newest first.
    if (pageParam) {
      const [rows, total] = await Promise.all([
        Invoice.find(query)
          .select('invoiceNumber patient visit total totalPaid outstandingBalance status createdAt')
          .populate({ path: 'patient', select: 'firstName lastName patientCode', match: patientTenantFilter(tenantId) })
          .populate({ path: 'visit', select: 'visitCode', match: tenantFilter(tenantId) })
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        Invoice.countDocuments(query),
      ]);
      return NextResponse.json({
        success: true,
        data: rows,
        pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      });
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
    // The visit must be this patient's, so an invoice never links someone else's visit.
    if (
      body.visit &&
      !(await Visit.exists(tenantFilter(tenantId, { _id: new Types.ObjectId(body.visit), patient: new Types.ObjectId(body.patient) })))
    ) {
      return NextResponse.json({ success: false, error: 'That visit is not one of this patient’s visits.' }, { status: 400 });
    }
    if (
      body.professionalFeeDoctor &&
      !(await Doctor.exists(tenantFilter(tenantId, { _id: new Types.ObjectId(body.professionalFeeDoctor) })))
    ) {
      return NextResponse.json({ success: false, error: 'Invalid doctor selected' }, { status: 400 });
    }

    const insurance = await resolveInsurance(tenantId, body.insurance);
    if (!insurance.ok) return NextResponse.json({ success: false, error: insurance.error }, { status: 400 });

    const settings = await getSettings(tenantId);
    const invoicePrefix = String(settings.billingSettings?.invoicePrefix || 'INV').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 10) || 'INV';

    const taxProfile = taxProfileOf(settings.birSettings);
    const discountProblem = taxProfile ? statutoryDiscountProblem(body.discounts) : null;
    if (discountProblem) return NextResponse.json({ success: false, error: discountProblem }, { status: 400 });

    const philhealth = body.philhealth ? await resolvePhilhealth(tenantId, body.philhealth, grossOf(body.items, body.professionalFee)) : null;
    if (philhealth && !philhealth.ok) return NextResponse.json({ success: false, error: philhealth.error }, { status: 400 });

    const totals = computeInvoiceTotals({
      items: body.items,
      discounts: body.discounts,
      professionalFee: body.professionalFee,
      tax: body.tax,
      taxRate: settings.billingSettings?.taxRate,
      appliedBy: session.userId,
      taxProfile,
      payerDeduction: philhealth?.ok ? philhealth.benefit : 0,
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
      ...(totals.breakdown ? { taxBreakdown: totals.breakdown } : {}),
      insurance: insurance.value,
      ...(philhealth?.ok ? { philhealth: capBenefit(philhealth.value, totals.total) } : {}),
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
