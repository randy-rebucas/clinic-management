import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';

/**
 * GET /api/patients/[id]/vitals
 * Returns vitals history for a patient across all visits, newest first.
 * Query params: limit (default 20, max 100)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const { id } = await params;
    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10))
    );

    const patient = await Patient.findById(id).lean();
    if (!patient) {
      return NextResponse.json({ success: false, error: 'Patient not found' }, { status: 404 });
    }

    const query: any = {
      patient: new Types.ObjectId(id),
      'vitals': { $exists: true },
    };
    if (tenantId) query.tenantId = new Types.ObjectId(tenantId);

    const visits = await Visit.find(query)
      .select('date vitals visitType visitCode')
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    // Only return visits that actually have at least one vital recorded
    const vitalsHistory = visits
      .filter((v) => v.vitals && Object.values(v.vitals as object).some((val) => val != null))
      .map((v) => ({
        visitId: v._id,
        visitCode: v.visitCode,
        visitType: v.visitType,
        date: v.date,
        vitals: v.vitals,
      }))
      .reverse(); // chronological order for charts

    return NextResponse.json({ success: true, data: vitalsHistory });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch vitals history' },
      { status: 500 }
    );
  }
}
