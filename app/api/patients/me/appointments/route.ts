import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Appointment from '@/models/Appointment';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { PATIENT_DOCTOR_POPULATE, withDoctorSummary } from '../../_lib/doctor-summary';
import { parsePagination, resolveTenantFilter } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';

const APPOINTMENT_STATUSES = ['pending', 'scheduled', 'confirmed', 'rescheduled', 'no-show', 'completed', 'cancelled'];

/**
 * GET /api/patients/me/appointments
 * Returns a paginated list of the authenticated patient's appointments,
 * most recent first. Query params: page (default 1), limit (default 10,
 * max 50), status?, tenantId?
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not authenticated. Please login.' },
      { status: 401 }
    );
  }

  try {
    await connectDB();

    const patient = await Patient.findById(session.patientId).select('active email tenantIds accountId').lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      await recordPatientRefused(patient as any, request, 'access');
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(searchParams, { defaultLimit: 10, maxLimit: 50 });
    const status = searchParams.get('status');
    if (status && !APPOINTMENT_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status.' }, { status: 400 });
    }

    // This person's records at every clinic (one per clinic when linked by phone).
    const linked = await linkedRecords(patient as any);
    const tenant = resolveTenantFilter(linked.tenantIds, session, searchParams.get('tenantId'));
    if (!tenant.ok) return tenant.response;

    const query: any = { patient: { $in: linked.patientIds }, ...tenant.filter };
    if (status) {
      query.status = status;
    }

    const [appointments, total] = await Promise.all([
      Appointment.find(query)
        // Staff notes are internal; the patient sees `reason`.
        .select('-notes -createdBy')
        .populate(PATIENT_DOCTOR_POPULATE)
        .sort({ appointmentDate: -1, scheduledAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<Record<string, any>[]>(),
      Appointment.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: appointments.map(withDoctorSummary),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Error fetching patient appointments', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch appointments' }, { status: 500 });
  }
}
