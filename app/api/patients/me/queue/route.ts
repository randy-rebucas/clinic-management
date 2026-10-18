import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Queue from '@/models/Queue';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { aheadOf } from '@/lib/queue-order';
import { resolveTenantFilter } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';

/**
 * GET /api/patients/me/queue
 * Returns the authenticated patient's current queue entry (if any) plus
 * their live position among patients still waiting ahead of them, mirroring
 * the position calculation in lib/automations/queue-notifications.ts.
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

    let position: number | null = null;
    if ((queueEntry as any).status === 'waiting') {
      const waitingAhead = await Queue.countDocuments({
        tenantId: (queueEntry as any).tenantId,
        status: 'waiting',
        ...aheadOf(queueEntry as any),
      });
      position = waitingAhead + 1;
    }

    return NextResponse.json({
      success: true,
      data: { ...queueEntry, position },
    });
  } catch (error) {
    logger.error('Error fetching patient queue status', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to fetch queue status' }, { status: 500 });
  }
}
