import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import {
  listAppointments,
  buildAppointmentWhere,
  createAppointment,
  getMaxAppointmentCodeNumber,
  countTodayWalkIns,
} from '@/lib/data/appointment';
import { findActiveDoctorById } from '@/lib/data/doctor';
import { getPatientById } from '@/lib/data/patient';
import type { Prisma } from '@prisma/client';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function GET(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'appointments', 'read');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get('date');
    const doctorId = searchParams.get('doctorId');
    const patientId = searchParams.get('patientId');
    const status = searchParams.get('status');
    const isWalkIn = searchParams.get('isWalkIn');
    const room = searchParams.get('room');

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const where = buildAppointmentWhere({
      date: date || undefined,
      doctorId: doctorId || undefined,
      patientId: patientId || undefined,
      statuses: status ? status.split(',') : undefined,
      isWalkIn: isWalkIn !== null && isWalkIn !== undefined ? isWalkIn === 'true' : undefined,
      room: room || undefined,
    });

    const appointments = await run(tenantId, () => listAppointments(where));

    return NextResponse.json({ success: true, data: appointments });
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch appointments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }

  const permissionCheck = await requirePermission(session, 'appointments', 'write');
  if (permissionCheck) {
    return permissionCheck;
  }

  try {
    const body = await request.json();

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Check subscription limit for creating appointments
    if (tenantId) {
      const { checkSubscriptionLimit } = await import('@/lib/subscription-limits');
      const limitCheck = await checkSubscriptionLimit(tenantId, 'createAppointment');
      if (!limitCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: limitCheck.reason || 'Subscription limit exceeded',
            limit: limitCheck.limit,
            current: limitCheck.current,
            remaining: limitCheck.remaining,
          },
          { status: 403 }
        );
      }
    }

    await run(tenantId, async () => {
      // Validate that the doctor belongs to the tenant
      if (body.doctor) {
        const doctor = await findActiveDoctorById(body.doctor);
        if (!doctor) {
          throw new ValidationError('Invalid doctor selected. Please select a doctor from this clinic.');
        }
      }

      // Validate that the patient belongs to the tenant (junction-scoped — check within runAsSystem + tenants array)
      if (body.patient) {
        const patient = tenantId
          ? await runAsSystem(() => getPatientById(body.patient))
          : null;
        const belongsToTenant = tenantId
          ? patient?.tenantIds?.some((tid: string) => tid === tenantId)
          : true;
        if (body.patient && tenantId && !belongsToTenant) {
          throw new ValidationError('Invalid patient selected. Please select a patient from this clinic.');
        }
      }
    });

    // Get settings for defaults
    const settings = await getSettings();
    if (!body.duration) {
      body.duration = settings.appointmentSettings?.defaultDuration || 30;
    }

    const result = await run(tenantId, async () => {
      // Auto-generate appointmentCode if not provided
      if (!body.appointmentCode) {
        const nextNumber = (await getMaxAppointmentCodeNumber()) + 1;
        body.appointmentCode = `APT-${String(nextNumber).padStart(6, '0')}`;
      }

      // For walk-ins, ensure queue number is set
      if (body.isWalkIn && !body.queueNumber) {
        const { maxQueueNumber } = await countTodayWalkIns();
        body.queueNumber = maxQueueNumber + 1;
      }

      const data: Prisma.AppointmentCreateInput = {
        appointmentCode: body.appointmentCode,
        appointmentDate: body.appointmentDate ?? undefined,
        appointmentTime: body.appointmentTime ?? undefined,
        scheduledAt: body.scheduledAt ?? undefined,
        duration: body.duration ?? 30,
        status: body.status ?? 'scheduled',
        isWalkIn: body.isWalkIn ?? false,
        queueNumber: body.queueNumber ?? undefined,
        estimatedWaitTime: body.estimatedWaitTime ?? undefined,
        queueId: body.queueId ?? undefined,
        room: body.room ?? undefined,
        reason: body.reason ?? undefined,
        notes: body.notes ?? '',
        patient: { connect: { id: body.patient } },
        doctor: body.doctor ? { connect: { id: body.doctor } } : undefined,
        provider: body.provider ?? undefined ? { connect: { id: body.provider } } : undefined,
        createdBy: { connect: { id: session.userId } },
      };

      return createAppointment(data);
    });

    // Send confirmation email if status is confirmed
    if (result.status === 'confirmed' && result.patient) {
      sendAppointmentReminder(result).catch(console.error);
    }

    // Auto-verify insurance if enabled (async, don't block response)
    if (tenantId && result.patient) {
      const { getSettings } = await import('@/lib/settings');
      const tenantSettings = await getSettings(tenantId.toString());
      if (tenantSettings?.automationSettings?.autoInsuranceVerification) {
        const { autoVerifyInsuranceForAppointment } = await import('@/lib/automations/insurance-verification');
        autoVerifyInsuranceForAppointment(result.id, tenantId).catch(console.error);
      }
    }

    // Auto-assign doctor if not assigned and smart assignment enabled (async, don't block response)
    if (!result.doctor && !result.provider && tenantId) {
      const { getSettings } = await import('@/lib/settings');
      const tenantSettings = await getSettings(tenantId.toString());
      if (tenantSettings?.automationSettings?.autoSmartAssignment) {
        const { assignDoctorToAppointment } = await import('@/lib/automations/smart-assignment');
        assignDoctorToAppointment({
          appointmentId: result.id,
          patientId: result.patientId,
          appointmentDate: result.appointmentDate || result.scheduledAt || undefined,
          appointmentTime: result.appointmentTime || '09:00',
          reason: result.reason ?? undefined,
          tenantId: tenantId ?? undefined,
        }).catch((error: any) => {
          console.error('Error in smart appointment assignment:', error);
        });
      }
    }

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create appointment' },
      { status: 500 }
    );
  }
}

class ValidationError extends Error {}

// Email reminder function (placeholder - implement with your email service)
async function sendAppointmentReminder(appointment: any) {
  // TODO: Implement actual email sending
}
