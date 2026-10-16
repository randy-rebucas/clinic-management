import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Doctor from '@/models/Doctor';
import Invoice from '@/models/Invoice';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { createAuditLog } from '@/lib/audit';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId, zMoney, zShortText, roundMoney } from '@/lib/api/validate';

const feeSchema = z.object({
  invoiceId: zObjectId.optional(),
  visitId: zObjectId.optional(),
  amount: zMoney,
  type: zShortText.optional(),
  notes: z.string().max(2000).optional(),
  date: z.coerce.date().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;
  const permissionCheck = await requirePermission(session, 'doctors', 'read');
  if (permissionCheck) return permissionCheck;
  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');
    const doctor = await Doctor.findOne(tenantFilter(tenantId, { _id: id })).lean() as any;
    if (!doctor) {
      return notFound('Doctor');
    }
    return NextResponse.json({ success: true, data: doctor.professionalFees || [] });
  } catch (error) {
    console.error('Error fetching doctor fees:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch fees' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;
  const permissionCheck = await requirePermission(session, 'doctors', 'update');
  if (permissionCheck) return permissionCheck;
  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Doctor');

    const parsed = await parseBody(request, feeSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const [doctor, invoiceOk, visitOk] = await Promise.all([
      Doctor.findOne(tenantFilter(tenantId, { _id: id })),
      body.invoiceId ? Invoice.exists(tenantFilter(tenantId, { _id: body.invoiceId })) : true,
      body.visitId ? Visit.exists(tenantFilter(tenantId, { _id: body.visitId })) : true,
    ]);
    if (!doctor) {
      return notFound('Doctor');
    }
    if (!invoiceOk) return notFound('Invoice');
    if (!visitOk) return notFound('Visit');

    const doc = doctor as any;
    doc.professionalFees = doc.professionalFees || [];
    const fee = {
      invoiceId: body.invoiceId,
      visitId: body.visitId,
      amount: roundMoney(body.amount),
      type: body.type,
      notes: body.notes,
      date: body.date || new Date(),
    };
    doc.professionalFees.push(fee);
    await doctor.save();

    await createAuditLog({
      userId: session.userId,
      tenantId,
      userEmail: session.email,
      userRole: session.role,
      action: 'update',
      resource: 'doctor',
      resourceId: doctor._id,
      changes: [{ field: 'professionalFees', newValue: fee }],
      description: `Added professional fee for doctor ${doctor._id}`,
      success: true,
      requestMethod: request.method,
      requestPath: request.nextUrl.pathname,
      ipAddress: request.headers.get('x-forwarded-for') || '',
      userAgent: request.headers.get('user-agent') || '',
      metadata: { invoiceId: body.invoiceId, visitId: body.visitId },
    });

    return NextResponse.json({ success: true, data: doc.professionalFees });
  } catch (error) {
    console.error('Error adding doctor fee:', error);
    return NextResponse.json({ success: false, error: 'Failed to add fee' }, { status: 500 });
  }
}
