import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Queue from '@/models/Queue';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

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

    const patient = await Patient.findById(session.patientId).lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
    }
    if ((patient as any).active === false) {
      return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
    }

    const patientTenantIds = (patient as any).tenantIds ?? [];
    const tenantIdParam = request.nextUrl.searchParams.get('tenantId');

    const query: any = {
      patient: session.patientId,
      status: { $in: ['waiting', 'in-progress'] },
    };
    if (tenantIdParam) {
      query.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      query.tenantId = { $in: patientTenantIds };
    }

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
        priority: { $lte: (queueEntry as any).priority },
        queuedAt: { $lt: (queueEntry as any).queuedAt },
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
