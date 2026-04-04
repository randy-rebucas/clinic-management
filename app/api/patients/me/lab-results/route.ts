import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import LabResult from '@/models/LabResult';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

/**
 * GET /api/patients/me/lab-results
 * Returns a paginated list of the authenticated patient's lab results
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

    const tenantIdParam = searchParams.get('tenantId');
    const patientTenantIds = (patient as any).tenantIds ?? [];

    const query: any = { patient: session.patientId };
    if (tenantIdParam) {
      query.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      query.tenantId = { $in: patientTenantIds };
    }

    const [labResults, total] = await Promise.all([
      LabResult.find(query)
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      LabResult.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: labResults,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching patient lab results', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch lab results' },
      { status: 500 }
    );
  }
}
