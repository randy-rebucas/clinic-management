import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import PhilhealthCaseRate from '@/models/PhilhealthCaseRate';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { caseRateUpdateSchema } from '../schema';

/** PUT: change a case rate. Claims already priced keep their amounts; mark a rate inactive to retire it. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;
  const { id } = await params;
  if (!isValidId(id)) return notFound('Case rate');
  const parsed = await parseBody(request, caseRateUpdateSchema);
  if (isValidationError(parsed)) return parsed;
  try {
    await connectDB();
    const query = { _id: new Types.ObjectId(id), tenantId: ctx.tenantObjectId };
    const current = await PhilhealthCaseRate.findOne(query).lean<{ amount: number; hciShare: number; pfShare: number } | null>();
    if (!current) return notFound('Case rate');
    const next = { ...current, ...parsed.data };
    if ((next.hciShare ?? 0) + (next.pfShare ?? 0) > next.amount + 0.005) {
      return NextResponse.json({ success: false, error: 'The facility and professional-fee shares add up to more than the case rate.' }, { status: 400 });
    }
    const row = await PhilhealthCaseRate.findOneAndUpdate(query, { $set: parsed.data }, { new: true, runValidators: true }).lean<{ code: string } | null>();
    if (!row) return notFound('Case rate');
    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'update',
      resource: 'philhealth',
      resourceId: id,
      description: `Changed PhilHealth case rate ${row.code}: ${Object.keys(parsed.data).join(', ')}`,
    });
    return NextResponse.json({ success: true, data: row });
  } catch (error: any) {
    if (error?.code === 11000) return NextResponse.json({ success: false, error: 'Another case rate already has that code.' }, { status: 409 });
    console.error('Error updating case rate:', error);
    return NextResponse.json({ success: false, error: 'Failed to save the case rate' }, { status: 500 });
  }
}
