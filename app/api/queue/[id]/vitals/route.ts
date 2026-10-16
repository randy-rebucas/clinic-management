import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import { requirePermission } from '@/app/lib/auth-helpers';
import { Types } from 'mongoose';
import { requireTenantSession, isTenantSessionError, isValidId, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { vitalsSchema } from '@/lib/visit-schema';

const vitalsBodySchema = z.object({ vitals: vitalsSchema });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'queue', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid queue ID' }, { status: 400 });
    }

    const parsed = await parseBody(request, vitalsBodySchema);
    if (isValidationError(parsed)) return parsed;

    const filter = tenantFilter(ctx.tenantId, { _id: new Types.ObjectId(id) });
    const currentQueue = await Queue.findOne(filter).select('vitals').lean() as any;
    if (!currentQueue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    // Merge vitals - preserve existing fields and add/update new ones
    const mergedVitals = { ...(currentQueue.vitals || {}), ...parsed.data.vitals };

    const updatedDoc = await Queue.findOneAndUpdate(filter, { $set: { vitals: mergedVitals } }, { new: true, lean: true });
    if (!updatedDoc) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedDoc,
      message: 'Vital signs recorded successfully'
    });
  } catch (error: any) {
    console.error('Error updating vitals:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update vital signs' },
      { status: 500 }
    );
  }
}
