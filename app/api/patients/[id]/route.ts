import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { updatePatientSchema } from '@/lib/patient-schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');
    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id }));
    if (!patient) return notFound('Patient');
    return NextResponse.json({ success: true, data: patient });
  } catch (error) {
    console.error('Error fetching patient:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const parsed = await parseBody(request, updatePatientSchema);
    if (isValidationError(parsed)) return parsed;
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== undefined) update[key] = value;
    }

    const patient = await Patient.findOneAndUpdate(
      patientTenantFilter(ctx.tenantId, { _id: id }),
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!patient) return notFound('Patient');
    return NextResponse.json({ success: true, data: patient });
  } catch (error: any) {
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid patient data' },
        { status: 400 }
      );
    }
    console.error('Error updating patient:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update patient' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  const permissionCheck = await requirePermission(ctx.session, 'patients', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const patient = await Patient.findOne(patientTenantFilter(ctx.tenantId, { _id: id })).select('tenantIds').lean();
    if (!patient) return notFound('Patient');

    // A patient shared with other clinics is only unlinked from this one.
    const otherClinics = ((patient as any).tenantIds || []).filter((t: any) => String(t) !== ctx.tenantId);
    if (otherClinics.length > 0) {
      await Patient.updateOne({ _id: id }, { $pull: { tenantIds: ctx.tenantObjectId } });
    } else {
      await Patient.deleteOne(patientTenantFilter(ctx.tenantId, { _id: id }));
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting patient:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete patient' },
      { status: 500 }
    );
  }
}
