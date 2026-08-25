import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/logger';
import { verifyPatientAuth } from '@/app/lib/patient-auth';
import { runAsSystem } from '@/lib/tenant-context';
import { getPatientById } from '@/lib/data/patient';
import { listDocuments } from '@/lib/data/document';
import type { Prisma } from '@prisma/client';

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
    const patient = await runAsSystem(() => getPatientById(session.patientId));
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
    const patientTenantIds: string[] = (patient as any).tenantIds ?? [];

    const where: Prisma.DocumentWhereInput = {
      patientId: session.patientId,
      status: 'active',
      isConfidential: { not: true },
    };

    if (tenantIdParam) {
      where.tenantId = tenantIdParam;
    } else if (patientTenantIds.length > 0) {
      where.tenantId = { in: patientTenantIds };
    }

    if (categoryFilter) {
      where.category = categoryFilter as Prisma.EnumDocumentCategoryFilter['equals'];
    }

    const { items: allItems, total } = await runAsSystem(() => listDocuments(where));
    const documents = allItems.slice(skip, skip + limit).map((d: any) => ({
      _id: d._id,
      documentCode: d.documentCode,
      title: d.title,
      description: d.description,
      category: d.category,
      documentType: d.documentType,
      filename: d.filename,
      size: d.size,
      uploadDate: d.uploadDate,
    }));

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
