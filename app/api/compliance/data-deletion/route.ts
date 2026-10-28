import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { createAuditLog, logDataDeletion } from '@/lib/audit';
import {
  requireTenantSession,
  isTenantSessionError,
  patientTenantFilter,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { erasePatientAtClinic } from '@/lib/patient-erasure';

const deletionSchema = z.object({
  patientId: zObjectId,
  reason: z.string().trim().max(1000).optional(),
  confirm: z.string().optional(),
  mode: z.enum(['anonymize', 'delete']).optional(),
});

/**
 * Delete patient data (PH DPA - Right to be Forgotten)
 * WARNING: This is a destructive operation
 *
 * A Patient document can be shared by several clinics (tenantIds). Only the calling
 * clinic's records are touched; see lib/patient-erasure.ts for what each mode removes.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  if (!isAdmin(session)) {
    return refuseAccess(session, 'Unauthorized - Admin access required', 'patient-data', 'delete');
  }

  try {
    await connectDB();

    const parsed = await parseBody(request, deletionSchema);
    if (isValidationError(parsed)) return parsed;
    const { patientId, reason, confirm } = parsed.data;

    if (confirm !== 'DELETE') {
      return NextResponse.json(
        { success: false, error: 'Confirmation required. Send confirm: "DELETE" to proceed.' },
        { status: 400 }
      );
    }

    const patient = await Patient.findOne(patientTenantFilter(tenantId, { _id: patientId }))
      .select('tenantIds')
      .lean() as any;
    if (!patient) {
      return notFound('Patient');
    }

    // Option 1: Anonymize (recommended for medical records - keep for legal requirements)
    // Option 2: Delete (for complete removal - use with caution)
    const deletionMode = parsed.data.mode || 'anonymize';
    const result = await erasePatientAtClinic(tenantObjectId, patientId, deletionMode);
    if (result.filesNotRemoved.length) {
      console.error('Data deletion: Cloudinary files not removed', { tenantId, files: result.filesNotRemoved });
    }

    await logDataDeletion(
      session.userId,
      session.email,
      session.role,
      'patient',
      patientId,
      patientId,
      request.headers.get('x-forwarded-for') || undefined,
      `/api/compliance/data-deletion`,
      tenantId
    );

    await createAuditLog({
      userId: session.userId,
      userEmail: session.email,
      userRole: session.role,
      tenantId: tenantId,
      action: 'data_deletion',
      resource: 'patient',
      resourceId: patientId,
      dataSubject: patientId,
      description: `Patient data ${deletionMode === 'anonymize' ? 'anonymized' : 'deleted'} per PH DPA request`,
      metadata: {
        mode: deletionMode,
        reason: reason || 'PH DPA - Right to be Forgotten',
        detachedOnly: result.detachedOnly,
        filesNotRemoved: result.filesNotRemoved,
      },
      isSensitive: true,
    });

    return NextResponse.json({
      success: true,
      message: `Patient data ${deletionMode === 'anonymize' ? 'anonymized' : 'deleted'} successfully`,
      mode: deletionMode,
      // Stored files that are still on Cloudinary and need removing by hand.
      filesNotRemoved: result.filesNotRemoved.length,
    });
  } catch (error: any) {
    console.error('Error deleting patient data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete patient data' },
      { status: 500 }
    );
  }
}
