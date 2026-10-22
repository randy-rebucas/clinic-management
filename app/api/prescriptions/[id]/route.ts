import { NextRequest, NextResponse, after } from 'next/server';
import mongoose from 'mongoose';
import { logRecordOpened } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Prescription from '@/models/Prescription';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import User from '@/models/User';
import { isAdmin, requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { updatePrescriptionSchema } from '@/lib/prescription-schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'prescriptions', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;

    if (!isValidId(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid prescription ID format' },
        { status: 400 }
      );
    }

    const prescription = await Prescription.findOne(tenantFilter(tenantId, { _id: id }))
      // Allergies travel with the prescription: whoever dispenses it should see them first.
      .populate({ path: 'patient', select: 'firstName lastName patientCode phone dateOfBirth allergies', match: { tenantIds: tenantObjectId } })
      .populate('prescribedBy', 'name email')
      .populate({ path: 'visit', select: 'visitCode date followUpDate', match: { tenantId: tenantObjectId } });

    if (!prescription) return notFound('Prescription');

    const prescriptionData: any = prescription.toObject();

    // Optionally attach medicine details (non-blocking)
    if (Array.isArray(prescriptionData.medications)) {
      const Medicine = mongoose.models.Medicine;
      if (Medicine) {
        await Promise.allSettled(
          prescriptionData.medications
            .filter((med: any) => med.medicineId && mongoose.Types.ObjectId.isValid(med.medicineId))
            .map(async (medication: any) => {
              const medicine = await Medicine.findOne({ _id: medication.medicineId, tenantId: tenantObjectId })
                .select('name genericName form strength')
                .lean();
              if (medicine) medication.medicine = medicine;
            })
        );
      }
    }

    after(() =>
      logRecordOpened({ session, tenantId, resource: 'prescription', resourceId: id, patientId: prescriptionData.patient?._id, request })
    );
    return NextResponse.json({ success: true, data: prescriptionData });
  } catch (error: any) {
    console.error('Error fetching prescription:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch prescription' },
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
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'prescriptions', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Prescription');

    const parsed = await parseBody(request, updatePrescriptionSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    if (body.patient && !(await Patient.exists({ _id: body.patient, tenantIds: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Invalid patient' }, { status: 400 });
    }
    if (body.visit && !(await Visit.exists({ _id: body.visit, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Invalid visit' }, { status: 400 });
    }
    if (body.prescribedBy && body.prescribedBy !== session.userId) {
      const current = await Prescription.findOne(tenantFilter(tenantId, { _id: id })).select('prescribedBy').lean<{ prescribedBy?: unknown } | null>();
      if (!current) return notFound('Prescription');
      // Moving a prescription to another doctor's name (and signature) is for an admin only.
      if (String(current.prescribedBy ?? '') !== body.prescribedBy && !isAdmin(session)) {
        return NextResponse.json({ success: false, error: 'You can only prescribe under your own name.' }, { status: 403 });
      }
      if (!(await User.exists({ _id: body.prescribedBy, tenantId: tenantObjectId }))) {
        return NextResponse.json({ success: false, error: 'Invalid prescriber' }, { status: 400 });
      }
    }

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) update[key] = value;
    }
    if (body.digitalSignature) update.digitalSignature = { ...body.digitalSignature, signedAt: new Date() };
    if (body.drugInteractions) update.drugInteractions = body.drugInteractions.map((i) => ({ ...i, checkedAt: new Date() }));
    if (['patient', 'visit', 'prescribedBy', 'medications', 'notes', 'digitalSignature'].some((k) => (body as Record<string, unknown>)[k] !== undefined)) {
      update.contentAuthor = session.userId;
    }

    const prescription = await Prescription.findOneAndUpdate(
      tenantFilter(tenantId, { _id: id }),
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!prescription) return notFound('Prescription');

    await prescription.populate({ path: 'patient', select: 'firstName lastName patientCode', match: { tenantIds: tenantObjectId } });
    await prescription.populate('prescribedBy', 'name email');
    await prescription.populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } });

    return NextResponse.json({ success: true, data: prescription });
  } catch (error: any) {
    console.error('Error updating prescription:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid prescription data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update prescription' },
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

  const permissionCheck = await requirePermission(ctx.session, 'prescriptions', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Prescription');

    const prescription = await Prescription.findOneAndDelete(tenantFilter(ctx.tenantId, { _id: id }));
    if (!prescription) return notFound('Prescription');

    return NextResponse.json({ success: true, data: {} });
  } catch (error: any) {
    console.error('Error deleting prescription:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete prescription' },
      { status: 500 }
    );
  }
}
