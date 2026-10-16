import { NextRequest, NextResponse, after } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Visit from '@/models/Visit';
import Queue from '@/models/Queue';
import Patient from '@/models/Patient';
import User from '@/models/User';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import Imaging from '@/models/Imaging';
import Procedure from '@/models/Procedure';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { updateVisitSchema, signatureWithMetadata } from '@/lib/visit-schema';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();

    // Ensure all models are registered before populate
    void [Prescription, LabResult, Imaging, Procedure, mongoose.models];

    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid visit ID' },
        { status: 400 }
      );
    }

    const sameTenant = { tenantId: tenantObjectId };
    const visit = await Visit.findOne(tenantFilter(tenantId, { _id: id }))
      .populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } })
      .populate('provider', 'name email')
      .populate({ path: 'prescriptions', match: sameTenant })
      .populate({ path: 'labsOrdered', match: sameTenant })
      .populate({ path: 'imagingOrdered', match: sameTenant })
      .populate({ path: 'proceduresPerformed', match: sameTenant });

    if (!visit) return notFound('Visit');
    return NextResponse.json({ success: true, data: visit });
  } catch (error: any) {
    console.error('Error fetching visit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch visit' },
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

  const permissionCheck = await requirePermission(session, 'visits', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Visit');

    const parsed = await parseBody(request, updateVisitSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    const query = tenantFilter(tenantId, { _id: id });
    const oldVisit = await Visit.findOne(query).select('status').lean() as any;
    if (!oldVisit) return notFound('Visit');

    if (body.patient) {
      const patient = await Patient.exists({ _id: body.patient, tenantIds: tenantObjectId });
      if (!patient) {
        return NextResponse.json(
          { success: false, error: 'Invalid patient selected. Please select a patient from this clinic.' },
          { status: 400 }
        );
      }
    }
    if (body.provider && body.provider !== session.userId) {
      const provider = await User.exists({ _id: body.provider, tenantId: tenantObjectId });
      if (!provider) {
        return NextResponse.json({ success: false, error: 'Invalid provider' }, { status: 400 });
      }
    }

    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) update[key] = value;
    }
    if (body.digitalSignature) {
      update.digitalSignature = signatureWithMetadata(body.digitalSignature, session.userId, request);
    }

    const statusChangedToClosed = oldVisit.status !== 'closed' && body.status === 'closed';

    const visit = await Visit.findOneAndUpdate(query, { $set: update }, {
      new: true,
      runValidators: true,
    });

    if (!visit) return notFound('Visit');

    await visit.populate({ path: 'patient', select: 'firstName lastName patientCode email phone', match: { tenantIds: tenantObjectId } });
    await visit.populate('provider', 'name email');

    // Update queue status based on visit status change
    if (body.status && oldVisit.status !== body.status) {
      const queueStatusMap: Record<string, string> = {
        'open': 'in-progress',
        'closed': 'completed',
        'cancelled': 'cancelled'
      };

      const newQueueStatus = queueStatusMap[body.status];

      if (newQueueStatus) {
        try {
          const updateData: any = { status: newQueueStatus };
          if (newQueueStatus === 'completed') {
            updateData.completedAt = new Date();
          }

          await Queue.findOneAndUpdate(
            tenantFilter(tenantId, {
              patient: (visit.patient as any)?._id || visit.patient,
              status: { $in: ['waiting', 'in-progress'] },
            }),
            { $set: updateData },
            { new: true, sort: { queuedAt: -1 } } // Update most recent queue entry
          );
        } catch (queueError) {
          console.error('Error updating queue status:', queueError);
        }
      }
    }

    // Auto-create or update prescription if medications are present in treatment plan. Drafts
    // wait; finishing a draft is when the prescription is first made, so the patient hears then.
    let prescriptionId: string | undefined;
    if (visit.status !== 'draft' && body.treatmentPlan?.medications && body.treatmentPlan.medications.length > 0) {
      try {
        const { updatePrescriptionFromVisit } = await import('@/lib/automations/prescription-from-visit');
        const prescription = await updatePrescriptionFromVisit({
          visitId: visit._id,
          tenantId: tenantObjectId,
          createdBy: session.userId,
          shouldSendNotification: oldVisit.status === 'draft',
        });
        if (prescription && (prescription as any)._id) {
          prescriptionId = (prescription as any)._id.toString();
        }
      } catch (error) {
        console.error('Error auto-updating prescription from visit:', error);
      }
    }

    // Closing a visit triggers billing, follow-up scheduling and the visit summary.
    // after() keeps the work alive past the response on serverless runtimes.
    if (statusChangedToClosed) {
      const visitId = visit._id;
      const hasFollowUp = !!visit.followUpDate;
      after(async () => {
        try {
          const { generateInvoiceForVisit } = await import('@/lib/automations/invoice-generation');
          await generateInvoiceForVisit({
            visitId,
            tenantId: tenantObjectId,
            createdBy: session.userId,
            sendNotification: true,
            sendEmail: true,
          });
        } catch (error) {
          console.error('Error generating automatic invoice:', error);
        }

        if (hasFollowUp) {
          try {
            const { scheduleFollowupAppointment } = await import('@/lib/automations/followup-scheduling');
            await scheduleFollowupAppointment({
              visitId,
              tenantId: tenantObjectId,
              sendNotification: true,
              sendEmail: true,
              sendSMS: true,
            });
          } catch (error) {
            console.error('Error scheduling follow-up appointment:', error);
          }
        }

        try {
          const { sendVisitSummary } = await import('@/lib/automations/visit-summaries');
          await sendVisitSummary({
            visitId,
            tenantId: tenantObjectId,
            sendSMS: true,
            sendEmail: true,
            sendNotification: true,
          });
        } catch (error) {
          console.error('Error sending visit summary:', error);
        }
      });
    }

    return NextResponse.json({ success: true, data: visit, prescriptionId });
  } catch (error: any) {
    console.error('Error updating visit:', error);
    if (error.name === 'ValidationError' || error.name === 'CastError') {
      return NextResponse.json(
        { success: false, error: 'Invalid visit data' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to update visit' },
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

  const permissionCheck = await requirePermission(ctx.session, 'visits', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Visit');

    const visit = await Visit.findOneAndDelete(tenantFilter(ctx.tenantId, { _id: id }));
    if (!visit) return notFound('Visit');
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting visit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete visit' },
      { status: 500 }
    );
  }
}
