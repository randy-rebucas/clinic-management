import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Document from '@/models/Document';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';

/**
 * GET /api/patients/me/documents
 * Returns a paginated list of the authenticated patient's non-confidential documents
 * Query params: page (default 1), limit (default 20, max 50), category?, tenantId?
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
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)));
    const skip = (page - 1) * limit;
    const categoryFilter = searchParams.get('category');
    const tenantIdParam = searchParams.get('tenantId');
    const patientTenantIds = (patient as any).tenantIds ?? [];

    const query: any = {
      patient: session.patientId,
      status: 'active',
      isConfidential: { $ne: true },
    };

    if (tenantIdParam) {
      query.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      query.tenantId = { $in: patientTenantIds };
    }

    if (categoryFilter) {
      query.category = categoryFilter;
    }

    const [documents, total] = await Promise.all([
      Document.find(query)
        .select('documentCode title description category documentType filename size uploadDate')
        .sort({ uploadDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Document.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: documents,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    logger.error('Error fetching patient documents', error as Error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}
