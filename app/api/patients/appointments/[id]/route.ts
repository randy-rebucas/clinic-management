import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { isValidId } from '@/lib/api/tenant-session';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { combineDateAndTimeInTz } from '@/lib/tz';
import { memberTenantIds } from '../../me/_lib/patient-scope';
import { linkedRecords } from '../../me/_lib/linked-records';

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

    await connectDB();

    const patient = await Patient.findById(sessionData.patientId).select('tenantIds accountId').lean();
    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Patient not found' },
        { status: 404 }
      );
    }
    const linked = await linkedRecords(patient as any);

    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json({ success: false, error: 'Appointment not found' }, { status: 404 });
    }

    // Only the patient's own appointments (on any linked record) at one of their clinics (the
    // session's clinic, when bound).
    const appointment = await Appointment.findOne({
      _id: id,
      patient: { $in: linked.patientIds },
      tenantId: { $in: memberTenantIds(linked.tenantIds, sessionData) },
    });

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }

    if (['completed', 'cancelled', 'no-show'].includes(appointment.status)) {
      return NextResponse.json(
        { success: false, error: `Cannot cancel an appointment that is already ${appointment.status}` },
        { status: 400 }
      );
    }

    const tz = await getTenantTimezone(appointment.tenantId);
    const appointmentDateTime = appointment.appointmentDate
      ? combineDateAndTimeInTz(appointment.appointmentDate, appointment.appointmentTime || '00:00', tz)
      : appointment.scheduledAt;

    if (appointmentDateTime && appointmentDateTime < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel past appointments' },
        { status: 400 }
      );
    }

    appointment.status = 'cancelled';
    appointment.notes = `${appointment.notes ? appointment.notes + '\n' : ''}Cancelled by patient on ${new Date().toISOString()}`;
    await appointment.save();

    logger.info('Patient cancelled appointment', {
      patientId: sessionData.patientId,
      appointmentId: id,
      appointmentCode: appointment.appointmentCode,
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
