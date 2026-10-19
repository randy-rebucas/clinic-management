import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Queue from '@/models/Queue';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { queuePosition } from '@/lib/queue-position';
import { resolveTenantFilter } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';

/**
 * GET /api/patients/me/queue
 * Returns the authenticated patient's current queue entry (if any) plus their live position in
 * their doctor's line (lib/queue-position.ts, as on the staff queue screen). `checkedIn` says
 * whether they still need to check in (POST /api/patients/me/check-in).
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);

  if (!session) return patientAuthError(request);

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

    // This person's records at every clinic (one per clinic when linked by phone).
    const linked = await linkedRecords(patient as any);
    const tenant = resolveTenantFilter(
      linked.tenantIds,
      session,
      request.nextUrl.searchParams.get('tenantId')
    );
    if (!tenant.ok) return tenant.response;

    const query: any = {
      patient: { $in: linked.patientIds },
      status: { $in: ['waiting', 'in-progress'] },
      ...tenant.filter,
    };

    const queueEntry = await Queue.findOne(query)
      .populate('doctor', 'firstName lastName')
      .populate('room', 'name')
      .sort({ queuedAt: -1 })
      .lean();

    if (!queueEntry) {
      return NextResponse.json({ success: true, data: null });
    }

    const position =
      (queueEntry as any).status === 'waiting'
        ? await queuePosition((queueEntry as any).tenantId, queueEntry as any)
        : null;

    return NextResponse.json({
      success: true,
      data: { ...queueEntry, position },
    });
  } catch (error) {
    logger.error('Error fetching patient queue status', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch queue status' }, { status: 500 });
  }
}
