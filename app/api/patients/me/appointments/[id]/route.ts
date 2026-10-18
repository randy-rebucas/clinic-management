import { NextRequest, NextResponse } from 'next/server';
import Appointment from '@/models/Appointment';
import logger from '@/lib/logger';
import { ownedRecordContext, isOwnedRecordError, recordNotFound } from '../../_lib/owned-record';
import { PATIENT_DOCTOR_POPULATE, withDoctorSummary } from '../../../_lib/doctor-summary';

/**
 * GET /api/patients/me/appointments/[id]
 * One of the authenticated patient's appointments.
 * Cancel with DELETE /api/patients/appointments/[id].
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ctx = await ownedRecordContext(request, id, 'Appointment');
    if (isOwnedRecordError(ctx)) return ctx;

    const appointment = await Appointment.findOne(ctx.filter)
      // Staff notes are internal; the patient sees `reason`.
      .select('-notes -createdBy')
      .populate(PATIENT_DOCTOR_POPULATE)
      .lean<Record<string, any>>();
    if (!appointment) return recordNotFound('Appointment');

    return NextResponse.json({ success: true, data: withDoctorSummary(appointment) });
  } catch (error) {
    logger.error('Error fetching patient appointment detail', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch appointment' }, { status: 500 });
  }
}
