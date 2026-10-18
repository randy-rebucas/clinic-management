import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { parsePagination, resolveTenantFilter } from '../_lib/patient-scope';
import { linkedRecords } from '../_lib/linked-records';

/**
 * GET /api/patients/me/visits
 * Returns a paginated list of the authenticated patient's visits
 * Query params: page (default 1), limit (default 10, max 50), tenantId?
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

    // Allow multi-clinic patients to filter by a specific tenant (within the session's scope)
    // This person's records at every clinic (one per clinic when linked by phone).
    const linked = await linkedRecords(patient as any);
    const tenant = resolveTenantFilter(linked.tenantIds, session, searchParams.get('tenantId'));
    if (!tenant.ok) return tenant.response;

    const visitQuery: any = { patient: { $in: linked.patientIds }, ...tenant.filter };

    const [visits, total] = await Promise.all([
      Visit.find(visitQuery)
        .populate({ path: 'provider', select: 'name' })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Visit.countDocuments(visitQuery),
    ]);

    return NextResponse.json({
      success: true,
      data: visits,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching patient visits', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch visits' },
      { status: 500 }
    );
  }
}
