import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Visit from '@/models/Visit';
import logger from '@/lib/logger';
import { verifyPatientSession } from '@/app/lib/dal';

/**
 * GET /api/patients/me/visits
 * Returns a paginated list of the authenticated patient's visits
 * Query params: page (default 1), limit (default 10, max 50), tenantId?
 */
export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('patient_session');
  const session = await verifyPatientSession(sessionCookie?.value);

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

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10', 10)));
    const skip = (page - 1) * limit;

    // Allow multi-clinic patients to filter by a specific tenant
    const tenantIdParam = searchParams.get('tenantId');
    const patientTenantIds = (patient as any).tenantIds ?? [];

    const visitQuery: any = { patient: session.patientId };
    if (tenantIdParam) {
      visitQuery.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      visitQuery.tenantId = { $in: patientTenantIds };
    }

    const [visits, total] = await Promise.all([
      Visit.find(visitQuery)
        .populate({ path: 'provider', select: 'firstName lastName email' })
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
