import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import { logRecordOpened } from '@/lib/audit';
import { z } from 'zod';
import { Types } from 'mongoose';
import Invoice from '@/models/Invoice';
import Service from '@/models/Service';
import Visit from '@/models/Visit';
import Doctor from '@/models/Doctor';
import User from '@/models/User';
import { OPEN_STATUSES } from '@/lib/invoices';
import { requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { requireTenantSession, isTenantSessionError, tenantFilter, patientTenantFilter, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, roundMoney } from '@/lib/api/validate';
import { invoiceEditableSchema, computeInvoiceTotals, deriveStatus, statutoryDiscountProblem, taxProfileOf } from '../_lib/totals';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;

    if (!isValidId(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    const invoiceData: any = await Invoice.findOne(tenantFilter(tenantId, { _id: new Types.ObjectId(id) }))
      .populate({
        path: 'patient',
        select: 'firstName lastName patientCode phone dateOfBirth',
        match: patientTenantFilter(tenantId),
      })
      .populate({ path: 'visit', select: 'visitCode date visitType', match: tenantFilter(tenantId) })
      .populate({ path: 'professionalFeeDoctor', select: 'firstName lastName', match: tenantFilter(tenantId) })
      .populate({ path: 'createdBy', select: 'name', model: User })
      .populate({ path: 'payments.processedBy', select: 'name', model: User })
      .lean();

    if (!invoiceData) {
      return notFound('Invoice');
    }

    // What else this patient still owes, so the cashier can collect it in the same visit.
    if (invoiceData.patient?._id) {
      const [other] = await Invoice.aggregate([
        {
          $match: tenantFilter(tenantId, {
            patient: invoiceData.patient._id,
            _id: { $ne: invoiceData._id },
            status: { $in: OPEN_STATUSES },
          }),
        },
        { $group: { _id: null, amount: { $sum: { $ifNull: ['$outstandingBalance', 0] } }, count: { $sum: 1 } } },
      ]);
      invoiceData.patientOtherOpen = { amount: Math.round((other?.amount || 0) * 100) / 100, count: other?.count || 0 };
    }

    // Populate items.serviceId from this clinic's catalog only
    if (Array.isArray(invoiceData.items)) {
      const serviceIds = invoiceData.items
        .map((item: any) => item.serviceId)
        .filter((sid: unknown) => sid && Types.ObjectId.isValid(String(sid)));
      if (serviceIds.length) {
        const services = await Service.find(tenantFilter(tenantId, { _id: { $in: serviceIds } }))
          .select('name code category unitPrice')
          .lean();
        const byId = new Map(services.map((s: any) => [String(s._id), s]));
        invoiceData.items = invoiceData.items.map((item: any) =>
          item.serviceId && byId.has(String(item.serviceId))
            ? { ...item, serviceId: byId.get(String(item.serviceId)) }
            : item
        );
      }
    }

    after(() =>
      logRecordOpened({ session, tenantId, resource: 'invoice', resourceId: id, patientId: invoiceData.patient?._id, request })
    );
    return NextResponse.json({ success: true, data: invoiceData });
  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}

const updateInvoiceSchema = invoiceEditableSchema.partial().extend({
  // Status is derived from payments; the only manual transition is marking an invoice refunded.
  status: z.enum(['unpaid', 'partial', 'paid', 'refunded']).optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  // Check permission to update invoices
  const permissionCheck = await requirePermission(session, 'invoices', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid invoice ID' }, { status: 400 });
    }

    const parsed = await parseBody(request, updateInvoiceSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const query = tenantFilter(tenantId, { _id: new Types.ObjectId(id) });
    const current: any = await Invoice.findOne(query).lean();
    if (!current) {
      return notFound('Invoice');
    }

    if (current.status === 'refunded') {
      return NextResponse.json({ success: false, error: 'Refunded invoices cannot be modified' }, { status: 409 });
    }

    if (
      body.visit &&
      !(await Visit.exists(tenantFilter(tenantId, { _id: new Types.ObjectId(body.visit), patient: current.patient })))
    ) {
      return NextResponse.json({ success: false, error: 'That visit is not one of this patient’s visits.' }, { status: 400 });
    }
    if (
      body.professionalFeeDoctor &&
      !(await Doctor.exists(tenantFilter(tenantId, { _id: new Types.ObjectId(body.professionalFeeDoctor) })))
    ) {
      return NextResponse.json({ success: false, error: 'Invalid doctor selected' }, { status: 400 });
    }

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};
    for (const key of ['professionalFeeType', 'professionalFeeNotes', 'insurance'] as const) {
      if (body[key] !== undefined) $set[key] = body[key];
    }
    for (const key of ['visit', 'professionalFeeDoctor'] as const) {
      if (body[key] === null) $unset[key] = 1;
      else if (body[key] !== undefined) $set[key] = body[key];
    }

    const totalPaid = roundMoney(
      (current.payments || []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
    );
    let total = Number(current.total) || 0;

    const moneyChanged =
      body.items !== undefined ||
      body.discounts !== undefined ||
      body.professionalFee !== undefined ||
      body.tax !== undefined;

    if (moneyChanged) {
      // An issued BIR invoice is a filed document: corrections go on a new invoice, not over it.
      if (current.bir?.serialNo) {
        return NextResponse.json(
          { success: false, error: `Sales invoice ${current.bir.serialNo} has been issued, so its amounts can’t change. Refund it and bill again.` },
          { status: 409 }
        );
      }
      const settings = await getSettings(tenantId);
      // Invoices made under BIR rules keep them; older ones keep the flat rate they were made with.
      const taxProfile = current.taxBreakdown ? taxProfileOf(settings.birSettings) : undefined;
      const discounts = body.discounts ?? (current.discounts || []).map((d: any) => ({
        type: d.type,
        reason: d.reason,
        idNumber: d.idNumber,
        percentage: d.percentage,
        amount: d.amount,
      }));
      const discountProblem = taxProfile ? statutoryDiscountProblem(discounts) : null;
      if (discountProblem) return NextResponse.json({ success: false, error: discountProblem }, { status: 400 });
      const totals = computeInvoiceTotals({
        items: body.items ?? (current.items || []).map((i: any) => ({
          serviceId: i.serviceId ? String(i.serviceId) : undefined,
          code: i.code,
          description: i.description,
          category: i.category,
          quantity: Number(i.quantity) || 1,
          unitPrice: Math.max(0, Number(i.unitPrice) || 0),
          vatClass: i.vatClass,
        })),
        discounts,
        professionalFee: body.professionalFee ?? current.professionalFee ?? 0,
        tax: body.tax ?? current.tax ?? 0,
        taxRate: settings.billingSettings?.taxRate,
        appliedBy: session.userId,
        taxProfile,
      });
      total = totals.total;
      Object.assign($set, {
        items: totals.items,
        discounts: totals.discounts,
        subtotal: totals.subtotal,
        professionalFee: totals.professionalFee,
        tax: totals.tax,
        total: totals.total,
      });
      if (totals.breakdown) $set.taxBreakdown = totals.breakdown;
      else $unset.taxBreakdown = 1;
    }

    const derived = deriveStatus(total, totalPaid);
    if (body.status === 'refunded') {
      $set.status = 'refunded';
    } else {
      if (body.status && body.status !== derived) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invoice status is determined by its payments. Record a payment to change it.',
          },
          { status: 400 }
        );
      }
      $set.status = derived;
    }
    $set.totalPaid = totalPaid;
    $set.outstandingBalance = roundMoney(total - totalPaid);

    // Optimistic concurrency: fail if a payment or edit landed since we read the invoice.
    const update: Record<string, unknown> = { $set };
    if (Object.keys($unset).length) update.$unset = $unset;
    const invoice = await Invoice.findOneAndUpdate(
      { ...query, updatedAt: current.updatedAt },
      update,
      { new: true, runValidators: true }
    );

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: 'Invoice was modified by someone else. Please reload and try again.' },
        { status: 409 }
      );
    }

    await invoice.populate({
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
      match: patientTenantFilter(tenantId),
    });
    await invoice.populate('visit', 'visitCode date');
    await invoice.populate('createdBy', 'name email');

    return NextResponse.json({ success: true, data: invoice });
  } catch (error: any) {
    console.error('Error updating invoice:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: 'Invalid invoice data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update invoice' },
      { status: 500 }
    );
  }
}
