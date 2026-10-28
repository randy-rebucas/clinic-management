import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { validateUpload } from '@/lib/upload-validation';
import { AttachmentStoreError, storeAttachment } from '@/lib/attachment-file';
import { LAB_STAFF_TRANSITIONS, isLabRole } from '@/lib/lab-results';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'lab-results', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Lab result');

    const formData = await request.formData();
    const file = formData.get('file');
    const notes = formData.get('notes');

    const check = await validateUpload(file instanceof File ? file : null);
    if (!check.ok) {
      return NextResponse.json({ success: false, error: check.error }, { status: check.status });
    }

    const labResult = await LabResult.findOne(tenantFilter(tenantId, { _id: id }));
    if (!labResult) return notFound('Lab result');

    const labStaff = isLabRole(session.role);
    if (labStaff && !LAB_STAFF_TRANSITIONS[labResult.status]) {
      return NextResponse.json(
        { success: false, error: 'This result has been reviewed or cancelled; changes now go through the clinician' },
        { status: 403 }
      );
    }

    const { checkStorageLimit } = await import('@/lib/storage-tracking');
    const storageCheck = await checkStorageLimit(tenantId, check.buffer.length);
    if (!storageCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: storageCheck.reason || 'Storage limit exceeded',
          storageUsage: storageCheck.currentUsage,
        },
        { status: 403 }
      );
    }

    const url = await storeAttachment(check, {
      tenantId,
      kind: 'lab-result',
      parent: { model: LabResult, filter: tenantFilter(tenantId, { _id: id }) },
    });
    labResult.attachments.push({
      filename: check.filename,
      contentType: check.contentType,
      size: check.buffer.length,
      url,
      uploadDate: new Date(),
      notes: typeof notes === 'string' && notes ? notes.slice(0, 2000) : undefined,
      uploadedBy: session.userId,
    } as any);

    // Only a file sent as the result completes an open request; a request form or sample photo doesn't.
    const completedNow = formData.get('complete') === '1' && (labResult.status === 'ordered' || labResult.status === 'in-progress');
    if (completedNow) {
      labResult.status = 'completed';
      if (!labResult.resultDate) {
        labResult.resultDate = new Date();
      }
      if (!labResult.performedBy) labResult.performedBy = session.userId as any;
      // Completed by the lab: the patient is told after a clinician reviews it.
      if (labStaff) labResult.awaitingReview = true;
    }

    await labResult.save();
    await labResult.populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } });
    await labResult.populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } });
    await labResult.populate('orderedBy', 'name email');

    if (completedNow && labResult.awaitingReview) {
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

    // Same as completing it by hand: tell the patient and the ordering doctor.
    if (completedNow && !labResult.awaitingReview && !labResult.notificationSent) {
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

    // File contents never go back in JSON; they open through ./files/[fileId].
    const data = labResult.toObject();
    data.attachments = (data.attachments ?? []).map(({ url: _stored, ...rest }: { url?: string }) => rest);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    if (error instanceof AttachmentStoreError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Error uploading lab result file:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
