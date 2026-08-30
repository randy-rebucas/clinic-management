import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getAppointmentById, findAppointmentByIdRaw, updateAppointment, deleteAppointment } from '@/lib/data/appointment';
import type { Prisma } from '@prisma/client';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

// Email reminder function (placeholder - implement with your email service)
async function sendAppointmentReminder(appointment: any) {
  // TODO: Implement actual email sending
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'appointments', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const appointment = await run(tenantId, () => getAppointmentById(id));
    if (!appointment) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to fetch appointment' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'appointments', 'update');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const { appointment, oldStatus } = await run(tenantId, async () => {
      const old = await findAppointmentByIdRaw(id);
      if (!old) return { appointment: null, oldStatus: undefined };

      const data: Prisma.AppointmentUpdateInput = { ...body };
      delete (data as any).id;
      delete (data as any)._id;
      delete (data as any).patient;
      delete (data as any).doctor;
      delete (data as any).provider;
      delete (data as any).createdBy;
      delete (data as any).tenantId;
      delete (data as any)._skipAutomation;
      if (body.patient) data.patient = { connect: { id: body.patient } };
      if (body.doctor !== undefined) data.doctor = body.doctor ? { connect: { id: body.doctor } } : { disconnect: true };
      if (body.provider !== undefined) data.provider = body.provider ? { connect: { id: body.provider } } : { disconnect: true };

      const updated = await updateAppointment(id, data);
      return { appointment: updated, oldStatus: old.status };
    });

    if (!appointment) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 });
    }

    const statusChangedToCancelled = oldStatus && oldStatus !== 'cancelled' && body.status === 'cancelled';

    // Send reminder if status changed to confirmed
    if (body.status === 'confirmed' && appointment.patient) {
      sendAppointmentReminder(appointment).catch(console.error);
    }

    // Check if appointment was cancelled - try to fill from waitlist
    if (statusChangedToCancelled) {
      import('@/lib/automations/waitlist-management').then(({ fillCancelledSlot }) => {
        fillCancelledSlot(appointment.id, tenantId ?? undefined).catch((error: any) => {
          console.error('Error filling cancelled slot from waitlist:', error);
        });
      }).catch((error) => {
        console.error('Error loading waitlist management module:', error);
      });
    }

    // Trigger queue status update automation if status changed
    const newStatus = body.status;
    const skipAutomation = body._skipAutomation === true;

    if (oldStatus !== newStatus && newStatus && !skipAutomation) {
      import('@/lib/automations/queue-from-appointment')
        .then(({ updateQueueFromAppointment }) => {
          updateQueueFromAppointment({
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            newAppointmentStatus: newStatus,
            tenantId: tenantId || undefined,
          }).catch((error: any) => {
            console.error('[Appointment API] Error in queue automation:', error);
          });
        })
        .catch((error) => {
          console.error('[Appointment API] Error loading queue automation module:', error);
        });
    }

    return NextResponse.json({ success: true, data: appointment });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update appointment' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'appointments', 'delete');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const deleted = await run(tenantId, async () => {
      const existing = await findAppointmentByIdRaw(id);
      if (!existing) return null;
      await deleteAppointment(id);
      return existing;
    });

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: {} });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to delete appointment' }, { status: 500 });
  }
}
