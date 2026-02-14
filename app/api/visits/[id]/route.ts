import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import mongoose from 'mongoose';
import Visit from '@/models/Visit';
import Queue from '@/models/Queue';
import Prescription from '@/models/Prescription';
import LabResult from '@/models/LabResult';
import Imaging from '@/models/Imaging';
import Procedure from '@/models/Procedure';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';
import { emitVisitUpdate } from '@/lib/websocket/emitHelper';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to read visits
  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    
    // Ensure all models are registered before populate
    if (!mongoose.models.Prescription) {
      const _ = Prescription;
    }
    if (!mongoose.models.LabResult) {
      const _ = LabResult;
    }
    if (!mongoose.models.Imaging) {
      const _ = Imaging;
    }
    if (!mongoose.models.Procedure) {
      const _ = Procedure;
    }
    
    const { id } = await params;
    
    if (!id || id === 'undefined') {
      return NextResponse.json(
        { success: false, error: 'Invalid visit ID' },
        { status: 400 }
      );
    }

    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }

    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
    }

    const visit = await Visit.findOne(query)
      .populate(patientPopulateOptions)
      .populate('provider', 'name email')
      .populate('prescriptions')
      .populate('labsOrdered')
      .populate('imagingOrdered')
      .populate('proceduresPerformed');
    
    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: visit });
  } catch (error: any) {
    console.error('Error fetching visit:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch visit' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to update visits
  const permissionCheck = await requirePermission(session, 'visits', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    // Auto-generate visitCode if creating new visit (tenant-scoped)
    if (!body.visitCode) {
      const codeQuery: any = { visitCode: { $exists: true, $ne: null } };
      if (tenantId) {
        codeQuery.tenantId = new Types.ObjectId(tenantId);
      } else {
        codeQuery.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
      }
      
      const lastVisit = await Visit.findOne(codeQuery)
        .sort({ visitCode: -1 })
        .exec();
      
      let nextNumber = 1;
      if (lastVisit?.visitCode) {
        const match = lastVisit.visitCode.match(/(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      
      body.visitCode = `VISIT-${String(nextNumber).padStart(6, '0')}`;
    }
    
    // Get old visit to check status change
    const oldVisit = await Visit.findOne(query);
    const statusChangedToClosed = oldVisit && oldVisit.status !== 'closed' && body.status === 'closed';
    
    // Handle digital signature - add provider ID and IP address
    if (body.digitalSignature) {
      const clientIp = request.headers.get('x-forwarded-for') || 
                       request.headers.get('x-real-ip') || 
                       'unknown';
      body.digitalSignature = {
        ...body.digitalSignature,
        providerId: session.userId,
        signedAt: new Date(),
        ipAddress: clientIp,
      };
    }
    
    const visit = await Visit.findOneAndUpdate(query, body, {
      new: true,
      runValidators: true,
    });
    
    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }
    
    // Build populate options with tenant filter
    const patientPopulateOptions: any = {
      path: 'patient',
      select: 'firstName lastName patientCode email phone',
    };
    if (tenantId) {
      patientPopulateOptions.match = { tenantIds: new Types.ObjectId(tenantId) };
    } else {
      patientPopulateOptions.match = { $or: [{ tenantIds: { $exists: false } }, { tenantIds: { $size: 0 } }] };
    }
    
    await visit.populate(patientPopulateOptions);
    await visit.populate('provider', 'name email');
    
    // Update queue status based on visit status change
    if (oldVisit && oldVisit.status !== body.status) {
      const queueStatusMap: Record<string, string> = {
        'open': 'in-progress',
        'closed': 'completed',
        'cancelled': 'cancelled'
      };
      
      const newQueueStatus = queueStatusMap[body.status];
      
      if (newQueueStatus) {
        try {
          // Find and update queue entry for this patient
          const queueQuery: any = {
            patient: visit.patient._id || visit.patient,
            status: { $in: ['waiting', 'in-progress'] } // Only update active queue entries
          };
          
          if (tenantId) {
            queueQuery.tenantId = new Types.ObjectId(tenantId);
          } else {
            queueQuery.tenantId = { $in: [null, undefined] };
          }
          
          const updateData: any = { status: newQueueStatus };
          
          // Add completion timestamp if status is completed
          if (newQueueStatus === 'completed') {
            updateData.completedAt = new Date();
          }
          
          const updatedQueue = await Queue.findOneAndUpdate(
            queueQuery,
            updateData,
            { new: true, sort: { queuedAt: -1 } } // Update most recent queue entry
          );
          
        } catch (queueError) {
          console.error('Error updating queue status:', queueError);
          // Don't fail visit update if queue update fails
        }
      }
    }
    
    // Auto-create or update prescription if medications are present in treatment plan
    if (body.treatmentPlan?.medications && body.treatmentPlan.medications.length > 0) {
      // Import and trigger prescription creation/update (async, don't wait)
      import('@/lib/automations/prescription-from-visit').then(({ updatePrescriptionFromVisit }) => {
        updatePrescriptionFromVisit({
          visitId: visit._id,
          tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
          createdBy: session.userId,
          shouldSendNotification: false, // Don't send notification on update, only on creation
        }).catch((error) => {
          console.error('Error auto-updating prescription from visit:', error);
          // Don't fail the visit update if prescription update fails
        });
      }).catch((error) => {
        console.error('Error loading prescription automation module:', error);
      });
    }
    
    // Check if visit status changed to 'closed' - trigger automatic invoice generation
    if (statusChangedToClosed) {
      // Import and trigger automatic invoice generation (async, don't wait)
      import('@/lib/automations/invoice-generation').then(({ generateInvoiceForVisit }) => {
        generateInvoiceForVisit({
          visitId: visit._id,
          tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
          createdBy: session.userId,
          sendNotification: true,
          sendEmail: true,
        }).catch((error) => {
          console.error('Error generating automatic invoice:', error);
          // Don't fail the visit update if invoice generation fails
        });
      }).catch((error) => {
        console.error('Error loading invoice generation module:', error);
      });

      // Check if visit has follow-up date - trigger automatic follow-up scheduling
      if (visit.followUpDate) {
        import('@/lib/automations/followup-scheduling').then(({ scheduleFollowupAppointment }) => {
          scheduleFollowupAppointment({
            visitId: visit._id,
            tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
            sendNotification: true,
            sendEmail: true,
            sendSMS: true,
          }).catch((error) => {
            console.error('Error scheduling follow-up appointment:', error);
            // Don't fail the visit update if follow-up scheduling fails
          });
        }).catch((error) => {
          console.error('Error loading follow-up scheduling module:', error);
        });
      }

      // Send visit summary to patient (async, don't wait)
      import('@/lib/automations/visit-summaries').then(({ sendVisitSummary }) => {
        sendVisitSummary({
          visitId: visit._id,
          tenantId: tenantId ? new Types.ObjectId(tenantId) : undefined,
          sendSMS: true,
          sendEmail: true,
          sendNotification: true,
        }).catch((error) => {
          console.error('Error sending visit summary:', error);
          // Don't fail the visit update if summary sending fails
        });
      }).catch((error) => {
        console.error('Error loading visit summaries module:', error);
      });
    }
    
    // Send follow-up reminder if followUpDate is set and not sent yet
    if (visit.followUpDate && !visit.followUpReminderSent) {
      // Schedule reminder (async, don't wait)
      sendFollowUpReminder(visit).catch(console.error);
    }

    // Emit WebSocket event for real-time updates
    emitVisitUpdate(visit, { tenantId: tenantId || undefined });
    
    return NextResponse.json({ success: true, data: visit });
  } catch (error: any) {
    console.error('Error updating visit:', error);
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { success: false, error: error.message },
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
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Check permission to delete visits
  const permissionCheck = await requirePermission(session, 'visits', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    await connectDB();
    const { id } = await params;
    
    // Get tenant context from session or headers
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;
    
    // Build query with tenant filter
    const query: any = { _id: id };
    if (tenantId) {
      query.tenantId = new Types.ObjectId(tenantId);
    } else {
      query.$or = [{ tenantId: { $exists: false } }, { tenantId: null }];
    }
    
    const visit = await Visit.findOneAndDelete(query);
    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting visit:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete visit' },
      { status: 500 }
    );
  }
}

// Follow-up reminder function (placeholder - implement with your email service)
async function sendFollowUpReminder(visit: any) {
  const patient = visit.patient;
  const followUpDate = visit.followUpDate;
  
  // TODO: Implement email service integration
  
  // TODO: Implement actual email sending
  // Update reminderSent flag after sending
}

