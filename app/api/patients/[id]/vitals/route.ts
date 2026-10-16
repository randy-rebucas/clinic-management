import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Patient from '@/models/Patient';
import { requirePermission } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, patientTenantFilter, tenantFilter } from '@/lib/api/tenant-session';
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
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  const permissionCheck = await requirePermission(session, 'visits', 'read');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const { id } = await params;
    if (!isValidId(id)) return notFound('Patient');

    const limit = Math.min(
      100,
      Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10) || 20)
    );

    const patient = await Patient.exists(patientTenantFilter(tenantId, { _id: id }));
    if (!patient) return notFound('Patient');

    const visits = await Visit.find(tenantFilter(tenantId, {
      patient: new Types.ObjectId(id),
      vitals: { $exists: true },
    }))
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
    console.error('Error fetching vitals history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch vitals history' },
      { status: 500 }
    );
  }
}
