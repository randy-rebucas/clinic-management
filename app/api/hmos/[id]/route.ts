import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Hmo from '@/models/Hmo';
import Invoice from '@/models/Invoice';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { createAuditLog } from '@/lib/audit';
import { HMO_FIELDS, hmoUpdateSchema } from '../schema';

/**
 * PUT: change an HMO. Renaming it renames its claims not yet paid, so reports keep grouping them
 * together. HMOs are never deleted (claims point at them); mark one inactive instead.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const permissionCheck = await requirePermission(ctx.session, 'invoices', 'write');
  if (permissionCheck) return permissionCheck;

  const { id } = await params;
  if (!isValidId(id)) return notFound('HMO');
  const parsed = await parseBody(request, hmoUpdateSchema);
  if (isValidationError(parsed)) return parsed;

  try {
    await connectDB();
    const query = { _id: new Types.ObjectId(id), tenantId: ctx.tenantObjectId };
    const before = await Hmo.findOne(query).select('name').lean<{ name: string } | null>();
    if (!before) return notFound('HMO');
    const hmo = await Hmo.findOneAndUpdate(query, { $set: parsed.data }, { new: true, runValidators: true }).select(HMO_FIELDS).lean<{ name: string } | null>();
    if (!hmo) return notFound('HMO');
    if (hmo.name !== before.name) {
      await Invoice.updateMany(
        { tenantId: ctx.tenantObjectId, 'insurance.hmo': query._id, 'insurance.status': { $in: ['pending', 'approved'] } },
        { $set: { 'insurance.provider': hmo.name } }
      );
    }
    await createAuditLog({
      userId: ctx.session.userId,
      userEmail: ctx.session.email,
      userRole: ctx.session.role,
      tenantId: ctx.tenantId,
      action: 'update',
      resource: 'hmo',
      resourceId: id,
      description: `Changed ${hmo.name} in the HMO list: ${Object.keys(parsed.data).join(', ')}`,
    });
    return NextResponse.json({ success: true, data: hmo });
  } catch (error: any) {
    if (error?.code === 11000) return NextResponse.json({ success: false, error: 'Another HMO already has that name.' }, { status: 409 });
    console.error('Error updating HMO:', error);
    return NextResponse.json({ success: false, error: 'Failed to save the HMO' }, { status: 500 });
  }
}
