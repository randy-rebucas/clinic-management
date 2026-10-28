import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import User from '@/models/User';
import { requirePermission } from '@/app/lib/auth-helpers';
import { logRecordOpened } from '@/lib/audit';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, escapeRegex } from '@/lib/api/validate';
import { updateLabResultSchema } from '@/lib/lab-result-schema';
import { LAB_STAFF_FIELDS, LAB_STAFF_TRANSITIONS, RESULT_FIELDS, canReviewLabs, isLabRole } from '@/lib/lab-results';

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

    // File contents (inline data URLs) are not sent; files open through ./files/[fileId].
    const labResult = await LabResult.findOne(tenantFilter(tenantId, { _id: id }))
      .select('-thirdPartyLab.apiKey -attachments.url')
      .populate({ path: 'patient', select: 'firstName lastName patientCode email phone dateOfBirth', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'visit', select: 'visitCode date visitType', match: { tenantId: tenantObjectId } })
      .populate({ path: 'orderedBy', select: 'name email', match: { tenantId: tenantObjectId } })
      .populate('receivedBy', 'name email')
      .populate('performedBy', 'name email')
      .populate('reviewedBy', 'name email');

    if (!labResult) return notFound('Lab result');

    // The patient's earlier results for the same test, so each value can be read against the last.
    const testType = String(labResult.request?.testType ?? '').trim();
    const history = testType
      ? await LabResult.find(
          tenantFilter(tenantId, {
            _id: { $ne: labResult._id },
            patient: labResult.patient?._id ?? labResult.patient,
            'request.testType': new RegExp(`^${escapeRegex(testType)}$`, 'i'),
            status: { $in: ['completed', 'reviewed'] },
            results: { $exists: true },
            orderDate: { $lte: labResult.orderDate ?? new Date() },
          })
        )
          .select('requestCode orderDate resultDate results abnormalFlags')
          .sort({ resultDate: -1, orderDate: -1 })
          .limit(6)
          .lean()
      : [];

    after(() =>
      logRecordOpened({ session, tenantId, resource: 'lab_result', resourceId: id, patientId: (labResult.patient as any)?._id, request })
    );
    return NextResponse.json({ success: true, data: labResult, history });
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

    if (body.status === 'reviewed' && !canReviewLabs(session.role)) {
      return NextResponse.json({ success: false, error: 'Results are reviewed by the clinician' }, { status: 403 });
    }
    // Lab staff work the request; changing what was ordered stays with the clinicians.
    if (isLabRole(session.role) && Object.keys(body).some((k) => body[k as keyof typeof body] !== undefined && !LAB_STAFF_FIELDS.has(k))) {
      return NextResponse.json({ success: false, error: 'Lab staff can only update progress and results' }, { status: 403 });
    }

    if (body.patient && !(await Patient.exists({ _id: body.patient, tenantIds: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Invalid patient' }, { status: 400 });
    }
    if (body.visit && !(await Visit.exists({ _id: body.visit, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Invalid visit' }, { status: 400 });
    }
    if (body.orderedBy && body.orderedBy !== session.userId && !(await User.exists({ _id: body.orderedBy, tenantId: tenantObjectId }))) {
      return NextResponse.json({ success: false, error: 'Invalid staff member' }, { status: 400 });
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
    const oldLabResult = await LabResult.findOne(query).select('status receivedBy performedBy').lean() as any;
    if (!oldLabResult) return notFound('Lab result');

    const labStaff = isLabRole(session.role);
    if (labStaff) {
      const allowed = LAB_STAFF_TRANSITIONS[oldLabResult.status];
      if (!allowed) {
        return NextResponse.json(
          { success: false, error: 'This result has been reviewed or cancelled; changes now go through the clinician' },
          { status: 403 }
        );
      }
      if (body.status && !allowed.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: 'Lab staff can receive and complete requests; cancelling or reopening stays with the clinician' },
          { status: 403 }
        );
      }
    }

    const unset: Record<string, ''> = {};
    const changesResult = RESULT_FIELDS.some((f) => body[f as keyof typeof body] !== undefined);
    if (oldLabResult.status === 'reviewed' && changesResult && body.status !== 'reviewed') {
      // The sign-off covered the old values: changed results go back for review.
      update.status = 'completed';
      unset.reviewedBy = '';
      unset.reviewedAt = '';
    }
    const newStatus = (update.status as string | undefined) ?? oldLabResult.status;
    const statusChangedToCompleted = oldLabResult.status !== 'completed' && newStatus === 'completed';
    const statusChangedToReviewed = oldLabResult.status !== 'reviewed' && newStatus === 'reviewed';
    // A result the lab completes is only shared with the patient after a clinician reviews it.
    if (labStaff && statusChangedToCompleted) update.awaitingReview = true;
    if (statusChangedToReviewed) unset.awaitingReview = '';

    // Who took the request in, and who entered the results: the first person to do each.
    if (body.status === 'in-progress' && !oldLabResult.receivedBy) {
      update.receivedBy = session.userId;
      update.receivedAt = new Date();
    }
    if ((body.results || body.status === 'completed') && !oldLabResult.performedBy) {
      update.performedBy = session.userId;
    }

    const labResult = await LabResult.findOneAndUpdate(query, { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, {
      new: true,
      runValidators: true,
    }).select('-thirdPartyLab.apiKey -attachments.url');

    if (!labResult) return notFound('Lab result');

    await labResult.populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } });
    await labResult.populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } });
    await labResult.populate({ path: 'orderedBy', select: 'name email', match: { tenantId: tenantObjectId } });
    await labResult.populate('receivedBy', 'name email');
    await labResult.populate('performedBy', 'name email');
    await labResult.populate('reviewedBy', 'name email');

    if (labStaff && statusChangedToCompleted) {
      const held = { _id: labResult._id, orderedBy: labResult.orderedBy, request: labResult.request };
      after(async () => {
        try {
          const { notifyDoctorToReview } = await import('@/lib/automations/lab-notifications');
          await notifyDoctorToReview(held, tenantObjectId);
        } catch (error) {
          console.error('Error asking for lab result review:', error);
        }
      });
    }

    const tellPatient = statusChangedToReviewed || (statusChangedToCompleted && !labResult.awaitingReview);
    if (tellPatient && !labResult.notificationSent) {
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
