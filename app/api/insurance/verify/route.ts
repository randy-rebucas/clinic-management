import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, patientTenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { verifyInsurance, batchVerifyInsurance } from '@/lib/automations/insurance-verification';

const verifySchema = z.object({
  patientId: zObjectId.optional(),
  patientIds: z.array(zObjectId).min(1).max(100).optional(),
});

/**
 * Verify insurance for a patient
 * POST /api/insurance/verify
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  // Verification writes the result back to the patient record.
  const permissionCheck = await requirePermission(ctx.session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  const parsed = await parseBody(request, verifySchema);
  if (isValidationError(parsed)) return parsed;
  const { patientId, patientIds } = parsed.data;

  if (!patientIds && !patientId) {
    return NextResponse.json(
      { success: false, error: 'patientId or patientIds required' },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    if (patientIds) {
      const uniqueIds = [...new Set(patientIds)];
      const owned = await Patient.find(patientTenantFilter(ctx.tenantId, { _id: { $in: uniqueIds } }))
        .select('_id')
        .lean<{ _id: unknown }[]>();
      const ownedIds = new Set(owned.map((p) => String(p._id)));
      if (ownedIds.size !== uniqueIds.length) {
        return NextResponse.json(
          { success: false, error: 'One or more patients not found' },
          { status: 404 }
        );
      }

      const result = await batchVerifyInsurance(uniqueIds, ctx.tenantId);
      return NextResponse.json({
        success: result.success,
        data: result,
      });
    }

    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: patientId })).select('_id').lean();
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    const result = await verifyInsurance(patientId!, ctx.tenantId);
    return NextResponse.json({
      success: result.verified,
      data: result,
    });
  } catch (error) {
    console.error('Error verifying insurance:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to verify insurance' },
      { status: 500 }
    );
  }
}
