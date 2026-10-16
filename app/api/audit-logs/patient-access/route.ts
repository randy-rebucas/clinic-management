import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import Patient from '@/models/Patient';
import { isAdmin } from '@/app/lib/auth-helpers';
import {
  requireTenantSession,
  isTenantSessionError,
  tenantFilter,
  patientTenantFilter,
  isValidId,
  notFound,
} from '@/lib/api/tenant-session';

/**
 * Get audit logs for a specific patient (PH DPA compliance - right to access)
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId } = ctx;

  // Access history reveals who viewed a patient's record; restrict to clinic admins and doctors.
  if (!isAdmin(session) && session.role !== 'doctor') {
    return NextResponse.json(
      { success: false, error: 'Forbidden' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const patientId = request.nextUrl.searchParams.get('patientId');

    if (!patientId) {
      return NextResponse.json(
        { success: false, error: 'Patient ID required' },
        { status: 400 }
      );
    }
    if (!isValidId(patientId)) {
      return notFound('Patient');
    }

    const patient = await Patient.exists(patientTenantFilter(tenantId, { _id: patientId }));
    if (!patient) {
      return notFound('Patient');
    }

    const logs = await AuditLog.find(tenantFilter(tenantId, {
      dataSubject: patientId,
      isSensitive: true,
    }))
      .populate('userId', 'name email role')
      .sort({ timestamp: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({
      success: true,
      data: logs,
      message: 'Patient data access history (PH DPA compliance)',
    });
  } catch (error: any) {
    console.error('Error fetching patient access logs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch patient access logs' },
      { status: 500 }
    );
  }
}
