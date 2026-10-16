import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { isAdmin } from '@/app/lib/auth-helpers';
import { createAuditLog, logDataDeletion } from '@/lib/audit';
import {
  requireTenantSession,
  isTenantSessionError,
  patientTenantFilter,
  tenantFilter,
  notFound,
} from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';

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
 * clinic's records are touched; the shared Patient document is anonymized/deleted only
 * when no other clinic still references it, otherwise this clinic is detached from it.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  if (!isAdmin(session)) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized - Admin access required' },
      { status: 403 }
    );
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

    const otherTenants = ((patient.tenantIds || []) as any[]).filter(
      (t) => String(t) !== tenantId
    );
    const sharedWithOtherClinics = otherTenants.length > 0;

    const Visit = (await import('@/models/Visit')).default;
    const Appointment = (await import('@/models/Appointment')).default;
    const Prescription = (await import('@/models/Prescription')).default;
    const LabResult = (await import('@/models/LabResult')).default;
    const Invoice = (await import('@/models/Invoice')).default;
    const Document = (await import('@/models/Document')).default;

    const scoped = () => tenantFilter(tenantId, { patient: patientId });

    // Option 1: Anonymize (recommended for medical records - keep for legal requirements)
    // Option 2: Delete (for complete removal - use with caution)
    const deletionMode = parsed.data.mode || 'anonymize';

    if (deletionMode === 'anonymize') {
      await Visit.updateMany(scoped(), { $set: { notes: '[Data anonymized]' } });

      if (sharedWithOtherClinics) {
        await Patient.updateOne({ _id: patientId }, { $pull: { tenantIds: tenantObjectId } });
      } else {
        await Patient.updateOne({ _id: patientId }, {
          $set: {
            firstName: '[ANONYMIZED]',
            lastName: '[ANONYMIZED]',
            email: `anonymized-${patientId}@deleted.local`,
            phone: '[ANONYMIZED]',
            address: {
              street: '[ANONYMIZED]',
              city: '[ANONYMIZED]',
              province: '[ANONYMIZED]',
              zipCode: '[ANONYMIZED]',
            },
            dateOfBirth: null,
            identifiers: {},
            emergencyContact: {},
            notes: '[Data anonymized per PH DPA request]',
          },
        });
      }
    } else {
      await Promise.all([
        Visit.deleteMany(scoped()),
        Appointment.deleteMany(scoped()),
        Prescription.deleteMany(scoped()),
        LabResult.deleteMany(scoped()),
        Invoice.deleteMany(scoped()),
        Document.updateMany(scoped(), { $set: { status: 'deleted' } }),
      ]);

      await Patient.updateOne({ _id: patientId }, { $pull: { tenantIds: tenantObjectId } });
      // Only remove the shared patient record once no clinic references it any more.
      await Patient.deleteOne({
        _id: patientId,
        $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }],
      });
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
        detachedOnly: sharedWithOtherClinics,
      },
      isSensitive: true,
    });

    return NextResponse.json({
      success: true,
      message: `Patient data ${deletionMode === 'anonymize' ? 'anonymized' : 'deleted'} successfully`,
      mode: deletionMode,
    });
  } catch (error: any) {
    console.error('Error deleting patient data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete patient data' },
      { status: 500 }
    );
  }
}
