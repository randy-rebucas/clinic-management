import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { findAppointmentByIdRaw, updateAppointment } from '@/lib/data/appointment';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

/**
 * Cancel an appointment for logged-in patient
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionData = await verifyPatientAuth(request);
    if (!sessionData) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login.' },
        { status: 401 }
      );
    }

    const patient = await runAsSystem(() => getPatientById(sessionData.patientId));
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }

    const patientTenantId = (patient as any).tenantIds?.[0];

    const { id } = await params;

    const result = await run(patientTenantId, async () => {
      // Find the appointment (tenant-scoped)
      const appointment = await findAppointmentByIdRaw(id);

      if (!appointment) {
        return { error: 'Appointment not found', status: 404 };
      }

      // Verify the appointment belongs to this patient
      if (appointment.patientId !== sessionData.patientId) {
        return { error: 'You can only cancel your own appointments', status: 403 };
      }

      // Check if appointment can be cancelled
      if (['completed', 'cancelled', 'no-show'].includes(appointment.status)) {
        return { error: `Cannot cancel an appointment that is already ${appointment.status}`, status: 400 };
      }

      // Check if appointment is in the past
      const appointmentDateTime = new Date(appointment.appointmentDate ?? Date.now());
      if (appointment.appointmentTime) {
        const [hours, minutes] = appointment.appointmentTime.split(':').map(Number);
        appointmentDateTime.setHours(hours, minutes, 0, 0);
      }

      if (appointmentDateTime < new Date()) {
        return { error: 'Cannot cancel past appointments', status: 400 };
      }

      // Cancel the appointment
      const notes = `${appointment.notes ? appointment.notes + '\n' : ''}Cancelled by patient on ${new Date().toISOString()}`;
      await updateAppointment(id, { status: 'cancelled', notes });

      return { appointmentCode: appointment.appointmentCode };
    });

    if ('error' in result) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    logger.info('Patient cancelled appointment', {
      patientId: sessionData.patientId,
      appointmentId: id,
      appointmentCode: result.appointmentCode,
    });

    return NextResponse.json({
      success: true,
      message: 'Appointment cancelled successfully',
    });

  } catch (error: any) {
    logger.error('Error cancelling appointment', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to cancel appointment' },
      { status: 500 }
    );
  }
}
