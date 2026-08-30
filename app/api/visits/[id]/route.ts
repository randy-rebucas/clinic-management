import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getVisitById, findVisitRawById, updateVisit, deleteVisit, getMaxVisitCodeNumber } from '@/lib/data/visit';
import { listQueueEntries, updateQueueEntry } from '@/lib/data/queue';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    if (!id || id === 'undefined') {
      return NextResponse.json({ success: false, error: 'Invalid visit ID' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const visit = await run(tenantId, () => getVisitById(id));
    if (!visit) {
      return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });
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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'visits', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    if (body.digitalSignature) {
      const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
      body.digitalSignature = {
        ...body.digitalSignature,
        providerId: session.userId,
        signedAt: new Date(),
        ipAddress: clientIp,
      };
    }

    const { visit, oldStatus } = await run(tenantId, async () => {
      const old = await findVisitRawById(id);
      if (!old) return { visit: null, oldStatus: undefined };

      if (!body.visitCode) {
        const nextNumber = (await getMaxVisitCodeNumber()) + 1;
        body.visitCode = `VISIT-${String(nextNumber).padStart(6, '0')}`;
      }

      const updated = await updateVisit(id, body);
      return { visit: updated, oldStatus: old.status };
    });

    if (!visit) {
      return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });
    }

    // Update queue status based on visit status change.
    if (oldStatus && oldStatus !== body.status) {
      const queueStatusMap: Record<string, string> = {
        open: 'in-progress',
        closed: 'completed',
        cancelled: 'cancelled',
      };
      const newQueueStatus = queueStatusMap[body.status];
      if (newQueueStatus) {
        try {
          const matches = await run(tenantId, () =>
            listQueueEntries({
              patientId: visit.patientId,
              status: { in: ['waiting', 'in_progress'] as any },
            })
          );
          // Mongoose's findOneAndUpdate(..., { sort: { queuedAt: -1 } })
          // updated the most recently queued matching entry.
          const target = [...matches].sort(
            (a: any, b: any) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime()
          )[0];
          if (target) {
            const updateData: Record<string, any> = { status: newQueueStatus };
            if (newQueueStatus === 'completed') {
              updateData.completedAt = new Date();
            }
            await run(tenantId, () => updateQueueEntry(target.id, updateData));
          }
        } catch (queueError) {
          console.error('Error updating queue status:', queueError);
        }
      }
    }

    // Auto-create or update prescription if medications are present in treatment plan
    let prescriptionId: string | undefined;
    if (body.treatmentPlan?.medications && body.treatmentPlan.medications.length > 0) {
      try {
        const { updatePrescriptionFromVisit } = await import('@/lib/automations/prescription-from-visit');
        const prescription = await updatePrescriptionFromVisit({
          visitId: visit.id,
          tenantId: tenantId || undefined,
          createdBy: session.userId,
          shouldSendNotification: false,
        });
        if (prescription && (prescription as any)._id) {
          prescriptionId = (prescription as any)._id.toString();
        } else if (prescription && (prescription as any).id) {
          prescriptionId = (prescription as any).id.toString();
        }
      } catch (error) {
        console.error('Error auto-updating prescription from visit:', error);
      }
    }

    const statusChangedToClosed = oldStatus !== 'closed' && body.status === 'closed';

    if (statusChangedToClosed) {
      import('@/lib/automations/invoice-generation').then(({ generateInvoiceForVisit }) => {
        generateInvoiceForVisit({
          visitId: visit.id,
          tenantId: tenantId ?? undefined,
          createdBy: session.userId,
          sendNotification: true,
          sendEmail: true,
        }).catch((error: any) => {
          console.error('Error generating automatic invoice:', error);
        });
      }).catch((error) => {
        console.error('Error loading invoice generation module:', error);
      });

      if (visit.followUpDate) {
        import('@/lib/automations/followup-scheduling').then(({ scheduleFollowupAppointment }) => {
          scheduleFollowupAppointment({
            visitId: visit.id,
            tenantId: tenantId ?? undefined,
            sendNotification: true,
            sendEmail: true,
            sendSMS: true,
          }).catch((error: any) => {
            console.error('Error scheduling follow-up appointment:', error);
          });
        }).catch((error) => {
          console.error('Error loading follow-up scheduling module:', error);
        });
      }

      import('@/lib/automations/visit-summaries').then(({ sendVisitSummary }) => {
        sendVisitSummary({
          visitId: visit.id,
          tenantId: tenantId ?? undefined,
          sendSMS: true,
          sendEmail: true,
          sendNotification: true,
        }).catch((error: any) => {
          console.error('Error sending visit summary:', error);
        });
      }).catch((error) => {
        console.error('Error loading visit summaries module:', error);
      });
    }

    if (visit.followUpDate && !visit.followUpReminderSent) {
      sendFollowUpReminder(visit).catch(console.error);
    }

    return NextResponse.json({ success: true, data: visit, prescriptionId });
  } catch (error: any) {
    console.error('Error updating visit:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update visit' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'visits', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const deleted = await run(tenantId, async () => {
      const existing = await findVisitRawById(id);
      if (!existing) return null;
      await deleteVisit(id);
      return existing;
    });

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Visit not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    console.error('Error deleting visit:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete visit' }, { status: 500 });
  }
}

// Follow-up reminder function (placeholder - implement with your email service)
async function sendFollowUpReminder(visit: any) {
  // TODO: Implement email service integration
}
