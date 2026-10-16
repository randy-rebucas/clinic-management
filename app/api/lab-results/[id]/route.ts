import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { updateLabResultSchema } from '@/lib/lab-result-schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'lab-results', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Lab result');

    const labResult = await LabResult.findOne(tenantFilter(tenantId, { _id: id }))
      .select('-thirdPartyLab.apiKey')
      .populate({ path: 'patient', select: 'firstName lastName patientCode email phone dateOfBirth', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'visit', select: 'visitCode date visitType', match: { tenantId: tenantObjectId } })
      .populate('orderedBy', 'name email')
      .populate('reviewedBy', 'name email');

    if (!labResult) return notFound('Lab result');

    return NextResponse.json({ success: true, data: labResult });
  } catch (error: any) {
    console.error('Error fetching lab result:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch lab result' },
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

  const permissionCheck = await requirePermission(session, 'lab-results', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Lab result');

    const parsed = await parseBody(request, updateLabResultSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    if (body.patient && !(await Patient.exists({ _id: body.patient, tenantIds: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Invalid patient' }, { status: 400 });
    }
    if (body.visit && !(await Visit.exists({ _id: body.visit, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Invalid visit' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) update[key] = value;
    }
    // reviewer is always the current user; never taken from the body
    delete update.reviewedBy;
    delete update.reviewedAt;
    if ((body.results || body.status === 'completed') && !body.resultDate) {
      update.resultDate = new Date();
    }
    if (body.status === 'reviewed') {
      update.reviewedBy = session.userId;
      update.reviewedAt = new Date();
    }
    // thirdPartyLab is a subdocument: only set the provided descriptive fields.
    if (body.thirdPartyLab) {
      delete update.thirdPartyLab;
      for (const [key, value] of Object.entries(body.thirdPartyLab)) {
        if (value !== undefined) update[`thirdPartyLab.${key}`] = value;
      }
    }

    const query = tenantFilter(tenantId, { _id: id });
    const oldLabResult = await LabResult.findOne(query).select('status').lean() as any;
    if (!oldLabResult) return notFound('Lab result');
    const statusChangedToCompleted = oldLabResult.status !== 'completed' && body.status === 'completed';

    const labResult = await LabResult.findOneAndUpdate(query, { $set: update }, {
      new: true,
      runValidators: true,
    }).select('-thirdPartyLab.apiKey');

    if (!labResult) return notFound('Lab result');

    await labResult.populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } });
    await labResult.populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } });
    await labResult.populate('orderedBy', 'name email');
    await labResult.populate('reviewedBy', 'name email');

    if (statusChangedToCompleted && !labResult.notificationSent) {
      const labResultId = labResult._id;
      after(async () => {
        try {
          const { sendLabResultNotification } = await import('@/lib/automations/lab-notifications');
          await sendLabResultNotification({
            labResultId,
            tenantId: tenantObjectId,
            sendSMS: true,
            sendEmail: true,
            sendNotification: true,
          });
        } catch (error) {
          console.error('Error sending automatic lab result notification:', error);
        }
      });
    }

    return NextResponse.json({ success: true, data: labResult });
  } catch (error: any) {
    console.error('Error updating lab result:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid lab result data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update lab result' },
      { status: 500 }
    );
  }
}
